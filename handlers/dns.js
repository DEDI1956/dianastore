const axios = require('axios');

const CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';

const getCfHeaders = (apiToken) => ({
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json'
});

const sendDnsMenu = (bot, chatId) => {
    const text = `━━━━━━━━━━━━━━━━━━\n📡 *Menu DNS*\nPilih salah satu opsi:\n━━━━━━━━━━━━━━━━━━`;
    bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '1️⃣ Set A Record', callback_data: 'dns_set_a' }, { text: '2️⃣ Set CNAME', callback_data: 'dns_set_cname' }],
                [{ text: '3️⃣ List A Records', callback_data: 'dns_list_a' }, { text: '4️⃣ List CNAME', callback_data: 'dns_list_cname' }],
                [{ text: '5️⃣ 🗑️ Hapus A Record', callback_data: 'dns_delete_a' }, { text: '6️⃣ 🗑️ Hapus CNAME', callback_data: 'dns_delete_cname' }],
                [{ text: '🔙 Kembali', callback_data: 'main_menu' }, { text: '🚪 Logout', callback_data: 'logout' }]
            ]
        }
    });
};

const register = (bot, userState, logger) => {
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text.trim();
        const state = userState[chatId];

        if (!state || !state.step || !state.step !== 'awaiting_dns_token') return;

        logger.info(`[DNS Auth] ChatID: ${chatId}, Step: ${state.step}`);
        if (state.step === 'awaiting_dns_token') {
            bot.sendMessage(chatId, 'Memverifikasi token...');
            try {
                // Verifikasi token dengan mencoba mengambil data user
                const verifyResponse = await axios.get(`${CLOUDFLARE_API_BASE_URL}/user`, { headers: getCfHeaders(text) });

                state.apiToken = text;
                state.accountId = verifyResponse.data.result.id; // Contoh saja, mungkin perlu disesuaikan
                delete state.step;

                bot.sendMessage(chatId, `✅ Login berhasil untuk akun ${verifyResponse.data.result.email}!`);

                // Panggil kembali handler callback yang asli
                if (state.nextCallback) {
                    const originalCallback = state.nextCallback;
                    delete state.nextCallback;
                    handle(bot, userState, originalCallback, logger);
                } else {
                    sendDnsMenu(bot, chatId);
                }
            } catch (error) {
                logger.error(`[DNS Auth] Invalid token for ${chatId}: ${error.message}`);
                bot.sendMessage(chatId, '❌ Token tidak valid. Silakan coba lagi.');
            }
        }
        // ... logika untuk step DNS lainnya ...
    });
};

const handle = (bot, userState, callbackQuery, logger) => {
    const { data, message } = callbackQuery;
    const chatId = message.chat.id;

    // Jawab query secepatnya
    bot.answerCallbackQuery(callbackQuery.id).catch(err => logger.error(`[DNS] answerCallbackQuery failed: ${err.stack}`));

    const state = userState[chatId] || {};

    // Cek login
    if (!state.apiToken || !state.accountId) {
        logger.info(`[DNS] Unauthenticated user ${chatId} trying to access ${data}.`);
        userState[chatId] = {
            step: 'awaiting_dns_token',
            nextCallback: callbackQuery // Simpan seluruh callback query
        };
        bot.sendMessage(chatId, 'Anda harus login untuk menggunakan fitur ini. Silakan masukkan API Token Cloudflare Anda:');
        return;
    }

    // Jika sudah login, lanjutkan
    logger.info(`[DNS] Authenticated user ${chatId} accessing ${data}.`);

    // Logika untuk setiap aksi DNS
    switch (data) {
        case 'dns_menu':
            sendDnsMenu(bot, chatId);
            break;

        // ... (implementasi untuk list, set, delete, dll.)
        case 'dns_list_a':
            bot.sendMessage(chatId, 'Fitur "List A Record" sedang dalam pengembangan.');
            break;
        default:
            bot.sendMessage(chatId, 'Fitur belum diimplementasikan.');
            break;
    }
};

module.exports = {
    register,
    handle
};
