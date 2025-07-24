const axios = require('axios');
const CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';

const getCfHeaders = (apiToken) => ({
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json'
});

const startLoginFlow = (bot, userState, chatId, requiredPerm, onSuccess) => {
    userState[chatId] = {
        ...(userState[chatId] || {}),
        step: 'auth_await_token',
        requiredPerm: requiredPerm,
        onSuccess: onSuccess,
    };
    bot.sendMessage(chatId, `Untuk melanjutkan, Anda perlu login ke Cloudflare.\n\nSilakan masukkan API Token Anda:`);
};

const ensureLoggedInDns = (bot, userState, chatId, onSuccess) => {
    const state = userState[chatId] || {};
    if (state.apiToken && state.accountId && state.zoneId) {
        onSuccess();
    } else {
        startLoginFlow(bot, userState, chatId, 'dns', onSuccess);
    }
};

const ensureLoggedInWorker = (bot, userState, chatId, onSuccess) => {
    const state = userState[chatId] || {};
    if (state.apiToken && state.accountId) {
        onSuccess();
    } else {
        startLoginFlow(bot, userState, chatId, 'worker', onSuccess);
    }
};

const register = (bot, userState, logger) => {
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const state = userState[chatId];

        if (!state || state.step !== 'auth_await_token') return;

        const text = msg.text.trim();
        logger.info(`[Auth] ChatID: ${chatId} received token for perm: ${state.requiredPerm}`);

        try {
            await bot.sendMessage(chatId, `Memvalidasi token...`);
            const apiToken = text;

            await axios.get(`${CLOUDFLARE_API_BASE_URL}/user`, { headers: getCfHeaders(apiToken) });
            state.apiToken = apiToken;
            logger.info(`[Auth] Token for ${chatId} is valid.`);

            if (state.requiredPerm === 'dns') {
                const response = await axios.get(`${CLOUDFLARE_API_BASE_URL}/zones`, { headers: getCfHeaders(apiToken) });
                const zones = response.data.result;
                if (!zones || zones.length === 0) throw new Error('Tidak ada Zona (domain) yang ditemukan di akun Anda.');

                const keyboard = zones.map(zone => ([{ text: zone.name, callback_data: `auth_set_zone_${zone.id}_${zone.account.id}` }]));
                await bot.sendMessage(chatId, '✅ Token valid! Pilih zona (domain) yang ingin Anda kelola:', { reply_markup: { inline_keyboard: keyboard } });
                delete state.step;

            } else if (state.requiredPerm === 'worker') {
                const response = await axios.get(`${CLOUDFLARE_API_BASE_URL}/accounts`, { headers: getCfHeaders(apiToken) });
                const accounts = response.data.result;
                if (!accounts || accounts.length === 0) throw new Error('Tidak ada Akun yang ditemukan.');

                const keyboard = accounts.map(acc => ([{ text: acc.name, callback_data: `auth_set_account_${acc.id}` }]));
                await bot.sendMessage(chatId, '✅ Token valid! Pilih akun yang ingin Anda kelola:', { reply_markup: { inline_keyboard: keyboard } });
                delete state.step;
            }

        } catch (error) {
            delete state.apiToken;
            const errorMessage = error.response?.status === 401 ? 'Unauthorized. API Token tidak valid.' : error.message;
            logger.error(`[Auth] Login failed for ${chatId}: ${errorMessage}`);
            await bot.sendMessage(chatId, `❌ Gagal: ${errorMessage}\nSilakan coba masukkan API Token yang benar:`);
        }
    });
};

const handle = (bot, userState, callbackQuery, logger) => {
    const { data, message } = callbackQuery;
    const chatId = message.chat.id;
    const state = userState[chatId];

    if (!state) {
        logger.warn(`[Auth Handle] No state found for chatId ${chatId} on callback.`);
        return;
    }

    try {
        bot.answerCallbackQuery(callbackQuery.id);

        let successMessage = '';
        if (data.startsWith('auth_set_account_')) {
            const accountId = data.replace('auth_set_account_', '');
            state.accountId = accountId;
            successMessage = `✅ Akun "${message.reply_markup.inline_keyboard.flat().find(btn => btn.callback_data === data)?.text}" dipilih.`;
            bot.editMessageText(successMessage, { chat_id: chatId, message_id: message.message_id });
        } else if (data.startsWith('auth_set_zone_')) {
            const [, , , zoneId, accountId] = data.split('_');
            state.zoneId = zoneId;
            state.accountId = accountId;
            successMessage = `✅ Zona "${message.reply_markup.inline_keyboard.flat().find(btn => btn.callback_data === data)?.text}" dipilih.`;
            bot.editMessageText(successMessage, { chat_id: chatId, message_id: message.message_id });
        }

        logger.info(`[Auth] Credentials set for ${chatId}: AccountID=${state.accountId}, ZoneID=${state.zoneId || 'N/A'}`);

        // Cek apakah login sudah lengkap
        const isLoggedIn = (state.requiredPerm === 'dns' && state.zoneId) || (state.requiredPerm === 'worker' && state.accountId);

        if (isLoggedIn && typeof state.onSuccess === 'function') {
            logger.info(`[Auth] Login complete for ${chatId}, executing onSuccess callback.`);
            const onSuccess = state.onSuccess;
            delete state.onSuccess;
            delete state.requiredPerm;
            onSuccess();
        } else {
             logger.warn(`[Auth] Login not yet complete for ${chatId} or onSuccess is not a function.`);
        }
    } catch(error) {
        logger.error(`[Auth Callback] Error: ${error.stack}`);
        bot.sendMessage(chatId, 'Terjadi kesalahan saat memproses pilihan Anda.');
    }
};

module.exports = {
    ensureLoggedInDns,
    ensureLoggedInWorker,
    register,
    handle,
};
