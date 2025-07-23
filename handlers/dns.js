const axios = require('axios');
const { sendStartMessage } = require('./start');

const CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';

// --- Fungsi Helper ---
const getCfHeaders = (apiToken) => ({
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json'
});

// --- Fungsi Menu ---
const sendDnsMenu = (bot, chatId) => {
    const text = `\
━━━━━━━━━━━━━━━━━━
📡 *Menu DNS*

Pilih salah satu opsi di bawah ini:
━━━━━━━━━━━━━━━━━━`;
    const options = {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '1️⃣ Set A Record', callback_data: 'dns_set_a' }, { text: '2️⃣ Set CNAME Record', callback_data: 'dns_set_cname' }],
                [{ text: '3️⃣ List A Records', callback_data: 'dns_list_a' }, { text: '4️⃣ List CNAME Records', callback_data: 'dns_list_cname' }],
                [{ text: '5️⃣ 🗑️ Hapus A Record', callback_data: 'dns_delete_a' }, { text: '6️⃣ 🗑️ Hapus CNAME', callback_data: 'dns_delete_cname' }],
                [{ text: '🔙 Kembali', callback_data: 'main_menu' }, { text: '🚪 Logout', callback_data: 'logout' }]
            ]
        }
    };
    bot.sendMessage(chatId, text, options);
};

const sendDeletionList = async (bot, chatId, state, recordType) => {
    try {
        const response = await axios.get(`${CLOUDFLARE_API_BASE_URL}/zones/${state.zoneId}/dns_records?type=${recordType}`, { headers: getCfHeaders(state.apiToken) });
        const records = response.data.result;

        if (records.length === 0) {
            bot.sendMessage(chatId, `Tidak ada ${recordType} record yang ditemukan untuk dihapus.`);
            sendDnsMenu(bot, chatId);
            return;
        }

        const keyboard = records.map(record => ([{
            text: `${record.name} -> ${record.content}`,
            callback_data: `dns_delete_confirm_${recordType}_${record.id}`
        }]));

        keyboard.push([{ text: '🔙 Batal', callback_data: 'dns_menu_loggedin' }]);

        bot.sendMessage(chatId, `Pilih ${recordType} record yang ingin dihapus:`, {
            reply_markup: { inline_keyboard: keyboard }
        });

    } catch (error) {
        bot.sendMessage(chatId, `❌ Gagal mengambil daftar record: ${error.message}`);
        sendDnsMenu(bot, chatId);
    }
};

// --- Logika Utama Handler ---
module.exports = (bot, userState) => {
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text.trim();

        if (!userState[chatId] || !userState[chatId].step) return;
        const state = userState[chatId];

        // ... (kode dari message handler sebelumnya)
        try {
            switch (state.step) {
                case 'awaiting_cf_token':
                    state.apiToken = text;
                    state.step = 'awaiting_account_id';
                    bot.sendMessage(chatId, 'API Token diterima. Sekarang masukkan Account ID Cloudflare Anda:');
                    break;
                case 'awaiting_account_id':
                    state.accountId = text;
                    state.step = 'awaiting_zone_id';
                    bot.sendMessage(chatId, 'Account ID diterima. Sekarang masukkan Zone ID untuk domain yang ingin Anda kelola:');
                    break;
                case 'awaiting_zone_id':
                    state.zoneId = text;
                    bot.sendMessage(chatId, 'Memvalidasi kredensial...');
                    await axios.get(`${CLOUDFLARE_API_BASE_URL}/zones/${state.zoneId}`, { headers: getCfHeaders(state.apiToken) });
                    bot.sendMessage(chatId, '✅ Login Cloudflare berhasil!');
                    state.step = 'dns_menu';
                    sendDnsMenu(bot, chatId);
                    break;
                case 'dns_a_subdomain':
                    state.subdomain = text;
                    state.step = 'dns_a_ip';
                    bot.sendMessage(chatId, 'Masukkan Alamat IP (contoh: 1.1.1.1):');
                    break;
                case 'dns_a_ip':
                    state.ip = text;
                    state.step = 'dns_a_proxy';
                    bot.sendMessage(chatId, 'Gunakan Proxy? (ON/OFF)', {
                        reply_markup: { inline_keyboard: [[{ text: 'ON', callback_data: 'dns_proxy_on' }, { text: 'OFF', callback_data: 'dns_proxy_off' }]] }
                    });
                    break;
                case 'dns_cname_subdomain':
                    state.subdomain = text;
                    state.step = 'dns_cname_target';
                    bot.sendMessage(chatId, 'Masukkan Target Domain (contoh: example.com):');
                    break;
                case 'dns_cname_target':
                    state.target = text;
                    state.step = 'dns_cname_proxy';
                    bot.sendMessage(chatId, 'Gunakan Proxy? (ON/OFF)', {
                        reply_markup: { inline_keyboard: [[{ text: 'ON', callback_data: 'dns_proxy_on' }, { text: 'OFF', callback_data: 'dns_proxy_off' }]] }
                    });
                    break;
            }
        } catch (error) {
            delete userState[chatId];
            sendStartMessage(bot, chatId);
        }
    });
};

// --- Handler untuk Callback Query ---
module.exports.handleCallback = async (bot, userState, callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const chatId = msg.chat.id;

    bot.answerCallbackQuery(callbackQuery.id).catch(console.error);
    const state = userState[chatId] || {};

    const ensureLogin = (nextCallback) => {
        if (state.apiToken && state.zoneId) {
            module.exports.handleCallback(bot, userState, { ...callbackQuery, data: nextCallback });
        } else {
            userState[chatId] = { ...(userState[chatId] || {}), step: 'awaiting_cf_token', nextCallback };
            bot.sendMessage(chatId, 'Untuk mengakses fitur DNS, silakan masukkan API Token Cloudflare Anda:');
        }
    };

    try {
        // --- Alur Hapus ---
        if (data.startsWith('dns_delete_confirm_')) {
            const parts = data.split('_');
            const recordType = parts[3];
            const recordId = parts[4];
            const recordName = msg.reply_markup.inline_keyboard.flat().find(btn => btn.callback_data === data)?.text || 'record';
            bot.editMessageText(`Apakah Anda yakin ingin menghapus ${recordName}?`, {
                chat_id: chatId,
                message_id: msg.message_id,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Ya, Hapus', callback_data: `dns_delete_execute_${recordType}_${recordId}` }],
                        [{ text: '❌ Batal', callback_data: 'dns_menu_loggedin' }]
                    ]
                }
            });
            return;
        }

        if (data.startsWith('dns_delete_execute_')) {
            const parts = data.split('_');
            const recordType = parts[3];
            const recordId = parts[4];
            await axios.delete(`${CLOUDFLARE_API_BASE_URL}/zones/${state.zoneId}/dns_records/${recordId}`, { headers: getCfHeaders(state.apiToken) });
            bot.editMessageText(`✅ Record ${recordType} berhasil dihapus.`, { chat_id: chatId, message_id: msg.message_id, reply_markup: null });
            sendDnsMenu(bot, chatId);
            return;
        }

        switch (data) {
            case 'dns_menu':
                ensureLogin('dns_menu_loggedin');
                break;
            case 'dns_menu_loggedin':
                sendDnsMenu(bot, chatId);
                break;

            // --- Alur Create/List (dari kode lama) ---
            case 'dns_set_a': ensureLogin('dns_set_a_loggedin'); break;
            case 'dns_set_a_loggedin':
                userState[chatId] = { ...state, step: 'dns_a_subdomain', recordType: 'A' };
                bot.sendMessage(chatId, 'Masukkan Subdomain untuk A Record (contoh: `api` atau `@` untuk root):');
                break;
            case 'dns_set_cname': ensureLogin('dns_set_cname_loggedin'); break;
            case 'dns_set_cname_loggedin':
                userState[chatId] = { ...state, step: 'dns_cname_subdomain', recordType: 'CNAME' };
                bot.sendMessage(chatId, 'Masukkan Subdomain untuk CNAME Record (contoh: `www`):');
                break;
            case 'dns_list_a': ensureLogin('dns_list_a_loggedin'); break;
            case 'dns_list_cname': ensureLogin('dns_list_cname_loggedin'); break;

            case 'dns_list_a_loggedin':
            case 'dns_list_cname_loggedin':
                const typeToList = (data === 'dns_list_a_loggedin') ? 'A' : 'CNAME';
                const responseList = await axios.get(`${CLOUDFLARE_API_BASE_URL}/zones/${state.zoneId}/dns_records?type=${typeToList}`, { headers: getCfHeaders(state.apiToken) });
                const records = responseList.data.result;
                let listText = `📋 *Daftar ${typeToList} Record*\n\n`;
                if (records.length === 0) listText += 'Tidak ada record yang ditemukan.';
                else records.forEach((r, i) => { listText += `${i + 1}. \`${r.name}\` → \`${r.content}\`\n`; });
                bot.sendMessage(chatId, listText, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'dns_menu_loggedin' }]] } });
                break;

            case 'dns_proxy_on':
            case 'dns_proxy_off':
                state.proxied = (data === 'dns_proxy_on');
                bot.sendMessage(chatId, `Membuat record...`);
                let payload, successText;
                if (state.recordType === 'A') {
                    payload = { type: 'A', name: state.subdomain, content: state.ip, proxied: state.proxied, ttl: 1 };
                    successText = `✅ *A Record Berhasil Dibuat*\n\n🌐 Domain: \`${state.subdomain}\`\n📡 IP: \`${state.ip}\`\n🔒 Proxy: ${state.proxied ? 'ON' : 'OFF'}`;
                } else {
                    payload = { type: 'CNAME', name: state.subdomain, content: state.target, proxied: state.proxied, ttl: 1 };
                    successText = `✅ *CNAME Record Berhasil Dibuat*\n\n🌐 Domain: \`${state.subdomain}\`\n🎯 Target: \`${state.target}\`\n🔒 Proxy: ${state.proxied ? 'ON' : 'OFF'}`;
                }
                await axios.post(`${CLOUDFLARE_API_BASE_URL}/zones/${state.zoneId}/dns_records`, payload, { headers: getCfHeaders(state.apiToken) });
                bot.sendMessage(chatId, successText, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'dns_menu_loggedin' }]] } });
                delete state.step;
                break;

            // --- Alur Hapus ---
            case 'dns_delete_a': ensureLogin('dns_delete_a_loggedin'); break;
            case 'dns_delete_a_loggedin': sendDeletionList(bot, chatId, state, 'A'); break;
            case 'dns_delete_cname': ensureLogin('dns_delete_cname_loggedin'); break;
            case 'dns_delete_cname_loggedin': sendDeletionList(bot, chatId, state, 'CNAME'); break;
        }
    } catch (error) {
        const errorMessage = error.response?.data?.errors?.[0]?.message || error.message || 'Terjadi kesalahan tidak diketahui.';
        bot.sendMessage(chatId, `❌ Terjadi kesalahan: ${errorMessage}`);
        sendDnsMenu(bot, chatId);
    }
};
