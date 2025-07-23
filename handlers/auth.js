const axios = require('axios');
const CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';

const getCfHeaders = (apiToken) => ({
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json'
});

/**
 * Memastikan pengguna sudah login. Jika belum, memulai alur login.
 * @param {object} bot - Instance bot Telegram.
 * @param {object} userState - Objek state pengguna.
 * @param {number} chatId - ID chat pengguna.
 * @param {string} requiredPerm - Tipe izin yang dibutuhkan ('dns' atau 'worker').
 * @param {function} onLoggedIn - Fungsi yang akan dijalankan setelah login berhasil.
 */
const ensureLoggedIn = (bot, userState, chatId, requiredPerm, onLoggedIn) => {
    const state = userState[chatId] || {};

    // Cek apakah kredensial yang dibutuhkan sudah ada
    const isLoggedIn = state.apiToken && state.accountId && (requiredPerm === 'worker' || state.zoneId);

    if (isLoggedIn) {
        onLoggedIn();
    } else {
        // Mulai alur login
        userState[chatId] = {
            ...state, // Pertahankan kredensial yang mungkin sudah ada
            step: 'auth_awaiting_token',
            requiredPerm,
            onSuccess: onLoggedIn, // Simpan fungsi untuk dijalankan nanti
        };
        bot.sendMessage(chatId, `Untuk melanjutkan, Anda perlu login ke Cloudflare.\n\nSilakan masukkan API Token Anda:`);
    }
};

const register = (bot, userState, logger) => {
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text.trim();

        if (!userState[chatId] || !userState[chatId].step || !userState[chatId].step.startsWith('auth_')) {
            return; // Bukan bagian dari alur otentikasi
        }

        const state = userState[chatId];
        logger.info(`[Auth] ChatID: ${chatId}, Step: ${state.step}, Input: ****`);

        try {
            switch (state.step) {
                case 'auth_awaiting_token':
                    state.apiToken = text;
                    state.step = 'auth_awaiting_account_id';
                    bot.sendMessage(chatId, '✅ Token diterima. Sekarang masukkan Account ID Anda:');
                    break;

                case 'auth_awaiting_account_id':
                    state.accountId = text;
                    // Validasi token dan account ID
                    await axios.get(`${CLOUDFLARE_API_BASE_URL}/accounts/${state.accountId}`, { headers: getCfHeaders(state.apiToken) });

                    if (state.requiredPerm === 'dns') {
                        state.step = 'auth_awaiting_zone_id';
                        bot.sendMessage(chatId, '✅ Akun valid. Sekarang masukkan Zone ID untuk domain Anda:');
                    } else { // Worker
                        bot.sendMessage(chatId, '✅ Login berhasil!');
                        delete state.step;
                        if (typeof state.onSuccess === 'function') {
                            state.onSuccess();
                        }
                    }
                    break;

                case 'auth_awaiting_zone_id':
                    state.zoneId = text;
                     // Validasi zone ID
                    await axios.get(`${CLOUDFLARE_API_BASE_URL}/zones/${state.zoneId}`, { headers: getCfHeaders(state.apiToken) });
                    bot.sendMessage(chatId, '✅ Login berhasil!');
                    delete state.step;
                    if (typeof state.onSuccess === 'function') {
                        state.onSuccess();
                    }
                    break;
            }
        } catch (error) {
            const errorMessage = error.response?.data?.errors?.[0]?.message || 'Token, ID, atau Zone tidak valid.';
            logger.error(`[Auth] Login failed for ${chatId}: ${errorMessage}`);
            bot.sendMessage(chatId, `❌ Login gagal: ${errorMessage}\nSilakan coba lagi dari awal.`);
            delete userState[chatId]; // Hapus semua state jika login gagal
        }
    });
};

module.exports = {
    ensureLoggedIn,
    register
};
