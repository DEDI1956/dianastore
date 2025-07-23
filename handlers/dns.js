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
    // ... (kode tetap sama)
};

const sendDeletionList = async (bot, chatId, state, recordType) => {
    try {
        bot.sendMessage(chatId, `⏳ Sedang mengambil daftar ${recordType} record...`);
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
    // ... (message handler tetap sama)
};

// --- Handler untuk Callback Query ---
module.exports.handleCallback = async (bot, userState, callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const chatId = msg.chat.id;

    // JAWAB QUERY SECEPATNYA
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
            // ... (kode tetap sama)
        }

        if (data.startsWith('dns_delete_execute_')) {
            // ... (kode tetap sama)
        }

        switch (data) {
            case 'dns_menu':
                ensureLogin('dns_menu_loggedin');
                break;
            case 'dns_menu_loggedin':
                sendDnsMenu(bot, chatId);
                break;

            // ... (alur create tetap sama)

            case 'dns_list_a': ensureLogin('dns_list_a_loggedin'); break;
            case 'dns_list_cname': ensureLogin('dns_list_cname_loggedin'); break;

            case 'dns_list_a_loggedin':
            case 'dns_list_cname_loggedin':
                const typeToList = (data === 'dns_list_a_loggedin') ? 'A' : 'CNAME';
                bot.sendMessage(chatId, `⏳ Sedang mengambil daftar ${typeToList} record...`);
                try {
                    const responseList = await axios.get(`${CLOUDFLARE_API_BASE_URL}/zones/${state.zoneId}/dns_records?type=${typeToList}`, { headers: getCfHeaders(state.apiToken) });
                    const records = responseList.data.result;
                    let listText = `📋 *Daftar ${typeToList} Record*\n\n`;
                    if (records.length === 0) listText += 'Tidak ada record yang ditemukan.';
                    else records.forEach((r, i) => { listText += `${i + 1}. \`${r.name}\` → \`${r.content}\`\n`; });
                    bot.sendMessage(chatId, listText, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'dns_menu_loggedin' }]] } });
                } catch (error) {
                    bot.sendMessage(chatId, `❌ Gagal mengambil daftar record: ${error.message}`);
                }
                break;

            // ... (alur proxy tetap sama)

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
