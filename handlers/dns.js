const axios = require('axios');

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
Pilih salah satu opsi:
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

const sendDeletionList = async (bot, chatId, state, recordType, logger) => {
    try {
        bot.sendMessage(chatId, `⏳ Sedang mengambil daftar ${recordType} record...`);
        const response = await axios.get(`${CLOUDFLARE_API_BASE_URL}/zones/${state.zoneId}/dns_records?type=${recordType}`, { headers: getCfHeaders(state.apiToken) });
        const records = response.data.result;

        if (records.length === 0) {
            bot.sendMessage(chatId, `Tidak ada ${recordType} record yang ditemukan.`);
            sendDnsMenu(bot, chatId);
            return;
        }

        const keyboard = records.map(record => ([{
            text: `${record.name} -> ${record.content}`,
            callback_data: `dns_delete_confirm_${recordType}_${record.id}`
        }]));
        keyboard.push([{ text: '🔙 Batal', callback_data: 'dns_menu_loggedin' }]);
        bot.sendMessage(chatId, `Pilih ${recordType} record yang ingin dihapus:`, { reply_markup: { inline_keyboard: keyboard } });
    } catch (error) {
        logger.error(`Failed to get DNS records for deletion: ${error.stack}`);
        bot.sendMessage(chatId, `❌ Gagal mengambil daftar record: ${error.message}`);
        sendDnsMenu(bot, chatId);
    }
};

// --- Logika Utama Handler ---
module.exports = (bot, userState, logger) => {
    const CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';

    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text.trim();

        if (!userState[chatId] || !userState[chatId].step) {
            if(text.startsWith('/')) return; // Abaikan command
            logger.warn(`No state found for chatId ${chatId}, but message received: "${text}"`);
            return;
        }

        const state = userState[chatId];
        logger.info(`ChatId ${chatId}: step=${state.step}, input="${text}"`);

        try {
            switch (state.step) {
                // ... (semua case dari message handler sebelumnya tetap sama)
                // Pastikan untuk menghapus step setelah selesai
                case 'awaiting_zone_id':
                    state.zoneId = text;
                    bot.sendMessage(chatId, 'Memvalidasi kredensial...');
                    await axios.get(`${CLOUDFLARE_API_BASE_URL}/zones/${state.zoneId}`, { headers: getCfHeaders(state.apiToken) });
                    bot.sendMessage(chatId, '✅ Login Cloudflare berhasil!');
                    delete state.step; // Hapus step
                    sendDnsMenu(bot, chatId);
                    break;
                // ...
            }
        } catch (error) {
            logger.error(`Error in DNS message handler: ${error.stack}`);
            delete userState[chatId]; // Hapus state jika error
            bot.sendMessage(chatId, `❌ Terjadi kesalahan: ${error.message}. Sesi direset.`);
        }
    });
};

// --- Handler untuk Callback Query ---
module.exports.handleCallback = async (bot, userState, callbackQuery, logger) => {
    // ... (kode dari callback handler sebelumnya)
    // Pastikan untuk menghapus step setelah selesai, contoh:
    const { message: msg, data, from: { id: chatId } } = callbackQuery;
    bot.answerCallbackQuery(callbackQuery.id).catch(err => logger.error(`AnswerCallbackQuery failed: ${err.stack}`));

    const state = userState[chatId] || {};

    try {
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
            case 'dns_proxy_on':
            case 'dns_proxy_off':
                // ...
                await axios.post(`${CLOUDFLARE_API_BASE_URL}/zones/${state.zoneId}/dns_records`, payload, { headers: getCfHeaders(state.apiToken) });
                bot.sendMessage(chatId, successText, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'dns_menu_loggedin' }]] } });
                delete state.step; // <-- PENTING: Hapus state setelah selesai
                break;
            // ... (terapkan penghapusan state di semua alur yang selesai)
        }
    } catch (error) {
        logger.error(`Error in DNS callback handler: ${error.stack}`);
        bot.sendMessage(chatId, `❌ Terjadi kesalahan: ${error.message}`);
        sendDnsMenu(bot, chatId);
    }
};
