const axios = require('axios');
const CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';

const getCfHeaders = (apiToken) => ({
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json'
});

const ensureLoggedIn = (bot, userState, chatId, requiredPerm, onSuccess) => {
    const state = userState[chatId] || {};

    const hasToken = !!state.apiToken;
    const hasWorkerPerms = hasToken && !!state.accountId;
    const hasDnsPerms = hasWorkerPerms && !!state.zoneId;

    let isMet = false;
    if (requiredPerm === 'worker') isMet = hasWorkerPerms;
    if (requiredPerm === 'dns') isMet = hasDnsPerms;

    if (isMet) {
        onSuccess();
    } else {
        userState[chatId] = {
            ...state,
            step: 'auth_await_token',
            requiredPerm: requiredPerm,
            onSuccess: onSuccess,
        };
        bot.sendMessage(chatId, `Untuk melanjutkan, Anda perlu login ke Cloudflare.\n\nSilakan masukkan API Token Anda:`);
    }
};

const register = (bot, userState, logger) => {
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const state = userState[chatId];

        // Kondisi yang diperbaiki: hanya berjalan jika state ada dan step-nya adalah 'auth_await_token'
        if (!state || state.step !== 'auth_await_token') return;

        const text = msg.text.trim();
        logger.info(`[Auth] ChatID: ${chatId} received message for step: ${state.step}`);

        try {
            bot.sendMessage(chatId, `Memvalidasi token...`);
            const apiToken = text;

            // Validasi token
            await axios.get(`${CLOUDFLARE_API_BASE_URL}/user`, { headers: getCfHeaders(apiToken) });

            // Simpan token yang valid
            state.apiToken = apiToken;
            logger.info(`[Auth] Token for ${chatId} is valid.`);

            if (state.requiredPerm === 'dns') {
                const response = await axios.get(`${CLOUDFLARE_API_BASE_URL}/zones`, { headers: getCfHeaders(apiToken) });
                const zones = response.data.result;
                if (zones.length === 0) throw new Error('Tidak ada Zona (domain) yang ditemukan di akun Anda.');

                const keyboard = zones.map(zone => ([{ text: zone.name, callback_data: `auth_set_zone_${zone.id}_${zone.account.id}` }]));
                bot.sendMessage(chatId, '✅ Token valid! Pilih zona (domain) yang ingin Anda kelola:', { reply_markup: { inline_keyboard: keyboard } });
                delete state.step; // Hapus step karena menunggu callback

            } else if (state.requiredPerm === 'worker') {
                const response = await axios.get(`${CLOUDFLARE_API_BASE_URL}/accounts`, { headers: getCfHeaders(apiToken) });
                const accounts = response.data.result;
                if (accounts.length === 0) throw new Error('Tidak ada Akun yang ditemukan.');

                const keyboard = accounts.map(acc => ([{ text: acc.name, callback_data: `auth_set_account_${acc.id}` }]));
                bot.sendMessage(chatId, '✅ Token valid! Pilih akun yang ingin Anda kelola:', { reply_markup: { inline_keyboard: keyboard } });
                delete state.step; // Hapus step karena menunggu callback
            }

        } catch (error) {
            delete state.apiToken; // Hapus token yang salah jika ada
            const errorMessage = error.response?.data?.errors?.[0]?.message || 'API Token tidak valid.';
            logger.error(`[Auth] Login failed for ${chatId}: ${errorMessage}`);
            bot.sendMessage(chatId, `❌ Gagal: ${errorMessage}\nSilakan coba masukkan API Token yang benar:`);
        }
    });
};

// Fungsi handle ini akan dipanggil oleh router utama di index.js
const handle = (bot, userState, callbackQuery, logger) => {
    const { data, message } = callbackQuery;
    const chatId = message.chat.id;
    const state = userState[chatId];

    if (!state) return; // Seharusnya tidak terjadi, tapi sebagai pengaman

    try {
        bot.answerCallbackQuery(callbackQuery.id);

        if (data.startsWith('auth_set_account_')) {
            const accountId = data.replace('auth_set_account_', '');
            state.accountId = accountId;
            bot.editMessageText(`✅ Akun "${message.reply_markup.inline_keyboard[0][0].text}" dipilih.`, { chat_id: chatId, message_id: message.message_id });
        } else if (data.startsWith('auth_set_zone_')) {
            const [, , , zoneId, accountId] = data.split('_');
            state.zoneId = zoneId;
            state.accountId = accountId;
            bot.editMessageText(`✅ Zona "${message.reply_markup.inline_keyboard[0][0].text}" dipilih.`, { chat_id: chatId, message_id: message.message_id });
        }

        logger.info(`[Auth] Credentials set for ${chatId}: AccountID=${state.accountId}, ZoneID=${state.zoneId || 'N/A'}`);

        if (typeof state.onSuccess === 'function') {
            const onSuccess = state.onSuccess;
            delete state.onSuccess; // Hapus agar tidak dipanggil lagi
            onSuccess();
        }
    } catch(error) {
        logger.error(`[Auth Callback] Error: ${error.stack}`);
        bot.sendMessage(chatId, 'Terjadi kesalahan saat memproses pilihan Anda.');
    }
};


module.exports = {
    ensureLoggedIn,
    register,
    handle,
};
