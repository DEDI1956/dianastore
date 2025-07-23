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
1️⃣ Set A Record
2️⃣ Set CNAME Record
3️⃣ List A Records
4️⃣ List CNAME Records
━━━━━━━━━━━━━━━━━━`;
    const options = {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '1️⃣ Set A Record', callback_data: 'dns_set_a' }],
                [{ text: '2️⃣ Set CNAME Record', callback_data: 'dns_set_cname' }],
                [{ text: '3️⃣ List A Records', callback_data: 'dns_list_a' }],
                [{ text: '4️⃣ List CNAME Records', callback_data: 'dns_list_cname' }],
                [{ text: '🔙 Kembali ke Menu Utama', callback_data: 'main_menu' }]
            ]
        }
    };
    bot.sendMessage(chatId, text, options);
};

// --- Logika Utama Handler ---
module.exports = (bot, userState) => {

    // Listener untuk semua pesan teks
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text.trim();

        if (!userState[chatId] || !userState[chatId].step) return;

        const state = userState[chatId];

        try {
            switch (state.step) {
                // --- Alur Login ---
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

                // --- Alur Buat A Record ---
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

                // --- Alur Buat CNAME Record ---
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
            console.error(error);
            bot.sendMessage(chatId, '❌ Terjadi kesalahan. Pastikan input Anda benar dan coba lagi.');
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

    bot.answerCallbackQuery(callbackQuery.id);
    const state = userState[chatId] || {};

    // Fungsi untuk memulai alur jika belum login
    const ensureLogin = (nextCallback) => {
        if (state.apiToken && state.zoneId) {
            module.exports.handleCallback(bot, userState, { ...callbackQuery, data: nextCallback });
        } else {
            userState[chatId] = { step: 'awaiting_cf_token', nextCallback };
            bot.sendMessage(chatId, 'Untuk mengakses fitur DNS, silakan masukkan API Token Cloudflare Anda:');
        }
    };

    try {
        switch (data) {
            case 'dns_menu':
                ensureLogin('dns_menu_loggedin');
                break;
            case 'dns_menu_loggedin':
                 sendDnsMenu(bot, chatId);
                 break;

            // --- Alur A Record ---
            case 'dns_set_a':
                ensureLogin('dns_set_a_loggedin');
                break;
            case 'dns_set_a_loggedin':
                userState[chatId] = { ...state, step: 'dns_a_subdomain', recordType: 'A' };
                bot.sendMessage(chatId, 'Masukkan Subdomain untuk A Record (contoh: `api` atau `@` untuk root):');
                break;

            // --- Alur CNAME Record ---
            case 'dns_set_cname':
                ensureLogin('dns_set_cname_loggedin');
                break;
            case 'dns_set_cname_loggedin':
                userState[chatId] = { ...state, step: 'dns_cname_subdomain', recordType: 'CNAME' };
                bot.sendMessage(chatId, 'Masukkan Subdomain untuk CNAME Record (contoh: `www`):');
                break;

            // --- Handler Proxy ---
            case 'dns_proxy_on':
            case 'dns_proxy_off':
                state.proxied = (data === 'dns_proxy_on');
                bot.sendMessage(chatId, `Proxy set to: ${state.proxied ? 'ON' : 'OFF'}. Membuat record...`);

                let payload, successText;
                if (state.recordType === 'A') {
                    payload = { type: 'A', name: state.subdomain, content: state.ip, proxied: state.proxied, ttl: 1 };
                    successText = `\
━━━━━━━━━━━━━━━━━━
✅ *A Record Berhasil Dibuat*

🌐 Domain: \`${state.subdomain}\`
📡 IP: \`${state.ip}\`
⏱️ TTL: Automatic
🔒 Proxy: ${state.proxied ? 'ON' : 'OFF'}
━━━━━━━━━━━━━━━━━━`;
                } else { // CNAME
                    payload = { type: 'CNAME', name: state.subdomain, content: state.target, proxied: state.proxied, ttl: 1 };
                     successText = `\
━━━━━━━━━━━━━━━━━━
✅ *CNAME Record Berhasil Dibuat*

🌐 Domain: \`${state.subdomain}\`
🎯 Target: \`${state.target}\`
⏱️ TTL: Automatic
🔒 Proxy: ${state.proxied ? 'ON' : 'OFF'}
━━━━━━━━━━━━━━━━━━`;
                }

                await axios.post(`${CLOUDFLARE_API_BASE_URL}/zones/${state.zoneId}/dns_records`, payload, { headers: getCfHeaders(state.apiToken) });
                bot.sendMessage(chatId, successText, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali ke Menu DNS', callback_data: 'dns_menu_loggedin' }]] } });
                // Reset state untuk operasi selanjutnya
                const preservedState = { apiToken: state.apiToken, accountId: state.accountId, zoneId: state.zoneId };
                userState[chatId] = { ...preservedState, step: 'dns_menu' };
                break;

            // --- List Records ---
            case 'dns_list_a':
            case 'dns_list_cname':
                ensureLogin(data + '_loggedin');
                break;
            case 'dns_list_a_loggedin':
            case 'dns_list_cname_loggedin':
                const type = (data === 'dns_list_a_loggedin') ? 'A' : 'CNAME';
                const response = await axios.get(`${CLOUDFLARE_API_BASE_URL}/zones/${state.zoneId}/dns_records?type=${type}`, { headers: getCfHeaders(state.apiToken) });
                const records = response.data.result;

                let listText = `\
━━━━━━━━━━━━━━━━━━
📋 *Daftar ${type} Record*
\n`;
                if (records.length === 0) {
                    listText += 'Tidak ada record yang ditemukan.';
                } else {
                    records.forEach((record, index) => {
                        listText += `${index + 1}. \`${record.name}\` → \`${record.content}\`\n`;
                    });
                }
                 listText += '━━━━━━━━━━━━━━━━━━';

                bot.sendMessage(chatId, listText, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali ke Menu DNS', callback_data: 'dns_menu_loggedin' }]] } });
                break;
        }
    } catch (error) {
        console.error(error.response ? error.response.data : error.message);
        bot.sendMessage(chatId, '❌ Terjadi kesalahan. Pastikan kredensial dan input Anda benar. Kembali ke menu utama.');
        delete userState[chatId];
        sendStartMessage(bot, chatId);
    }
};
