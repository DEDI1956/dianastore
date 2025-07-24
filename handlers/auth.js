const axios = require('axios');
const CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';

const getCfHeaders = (apiToken) => ({
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json'
});

const PERMISSIONS = {
    dns: ['apiToken', 'accountId', 'zoneId'],
    worker: ['apiToken', 'accountId']
};

const PROMPTS = {
    apiToken: 'Untuk melanjutkan, Anda perlu login ke Cloudflare.\n\nSilakan masukkan API Token Anda:',
    accountId: '✅ Token valid. Sekarang masukkan Account ID Anda:',
    zoneId: '✅ Account ID diterima. Sekarang masukkan Zone ID untuk domain Anda:'
};

const STEPS = {
    apiToken: 'auth_await_token',
    accountId: 'auth_await_account_id',
    zoneId: 'auth_await_zone_id'
};

const ensureLoggedIn = (bot, userState, chatId, requiredPerm, onSuccess) => {
    const state = userState[chatId] || {};
    const neededPerms = PERMISSIONS[requiredPerm].filter(p => !state[p]);

    if (neededPerms.length === 0) {
        onSuccess();
    } else {
        const firstNeeded = neededPerms[0];
        userState[chatId] = {
            ...state,
            step: STEPS[firstNeeded],
            neededPerms: neededPerms, // Simpan semua perms yang dibutuhkan
            onSuccess: onSuccess,
        };
        bot.sendMessage(chatId, PROMPTS[firstNeeded]);
    }
};

const register = (bot, userState, logger) => {
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const state = userState[chatId];

        if (!state || !state.step || !state.step.startsWith('auth_')) return;

        try {
            const text = msg.text.trim();
            logger.info(`[Auth] ChatID: ${chatId}, Step: ${state.step}`);

            const currentPerm = state.neededPerms[0];

            switch (state.step) {
                case 'auth_await_token':
                    await axios.get(`${CLOUDFLARE_API_BASE_URL}/user`, { headers: getCfHeaders(text) });
                    state.apiToken = text;
                    break;
                case 'auth_await_account_id':
                    await axios.get(`${CLOUDFLARE_API_BASE_URL}/accounts/${text}`, { headers: getCfHeaders(state.apiToken) });
                    state.accountId = text;
                    break;
                case 'auth_await_zone_id':
                     await axios.get(`${CLOUDFLARE_API_BASE_URL}/zones/${text}`, { headers: getCfHeaders(state.apiToken) });
                    state.zoneId = text;
                    break;
            }

            state.neededPerms.shift(); // Hapus izin yang sudah terpenuhi

            if (state.neededPerms.length === 0) {
                bot.sendMessage(chatId, `✅ Login berhasil!`);
                delete state.step;
                delete state.neededPerms;
                if (typeof state.onSuccess === 'function') {
                    state.onSuccess();
                    delete state.onSuccess;
                }
            } else {
                const nextPerm = state.neededPerms[0];
                state.step = STEPS[nextPerm];
                bot.sendMessage(chatId, PROMPTS[nextPerm]);
            }

        } catch (error) {
            const errorMessage = error.response?.data?.errors?.[0]?.message || 'Input tidak valid.';
            logger.error(`[Auth] Login failed for ${chatId}: ${errorMessage}`);
            bot.sendMessage(chatId, `❌ Gagal: ${errorMessage}\nSilakan coba masukkan lagi:`);
        }
    });
};

module.exports = {
    ensureLoggedIn,
    register
};
