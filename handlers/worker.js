const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';

const getCfHeaders = (apiToken) => ({
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json'
});

// ... (sendWorkerMenu, checkAndInstallWrangler, dll. tetap sama)

const register = (bot, userState, logger) => {
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        try {
            const text = msg.text.trim();
            const state = userState[chatId];

            if (!state || !state.step || !state.step.startsWith('awaiting_worker')) return;

            logger.info(`[Worker Auth] ChatID: ${chatId}, Step: ${state.step}`);

            switch (state.step) {
                case 'awaiting_worker_token':
                    bot.sendMessage(chatId, 'Memverifikasi token...');
                    const verifyResponse = await axios.get(`${CLOUDFLARE_API_BASE_URL}/user`, { headers: getCfHeaders(text) });
                    state.apiToken = text;
                    state.step = 'awaiting_worker_account_id';
                    bot.sendMessage(chatId, `✅ Token valid untuk ${verifyResponse.data.result.email}!\nSekarang masukkan Account ID:`);
                    break;
                case 'awaiting_worker_account_id':
                    state.accountId = text;
                    await axios.get(`${CLOUDFLARE_API_BASE_URL}/accounts/${state.accountId}`, { headers: getCfHeaders(state.apiToken) });

                    bot.sendMessage(chatId, `✅ Login Worker berhasil!`);
                    delete state.step;

                    if (state.nextCallback) {
                        const originalCallback = state.nextCallback;
                        delete state.nextCallback;
                        handle(bot, userState, originalCallback, logger);
                    } else {
                        sendWorkerMenu(bot, chatId);
                    }
                    break;
                // ... (case untuk deploy name, repo, dll.)
            }
        } catch (error) {
            const errorMessage = error.response?.data?.errors?.[0]?.message || error.message;
            logger.error(`[Worker Auth] Error for ${chatId}: ${errorMessage}`);
            bot.sendMessage(chatId, `❌ Gagal: ${errorMessage}. Silakan coba lagi.`);
        }
    });
};

const handle = async (bot, userState, callbackQuery, logger) => {
    const { data, message } = callbackQuery;
    const chatId = message.chat.id;

    bot.answerCallbackQuery(callbackQuery.id).catch(err => logger.error(`[Worker] answerCallbackQuery failed: ${err.stack}`));

    const state = userState[chatId] || {};

    if (!state.apiToken || !state.accountId) {
        logger.info(`[Worker] Unauthenticated user ${chatId} for ${data}.`);
        userState[chatId] = { ...state, step: 'awaiting_worker_token', nextCallback: callbackQuery };
        bot.sendMessage(chatId, 'Anda harus login untuk fitur Worker. Silakan masukkan API Token Cloudflare Anda:');
        return;
    }

    try {
        logger.info(`[Worker] Authenticated user ${chatId} accessing ${data}.`);

        switch (data) {
            case 'worker_menu':
                sendWorkerMenu(bot, chatId);
                break;

            case 'worker_list':
                bot.sendMessage(chatId, '⏳ Mengambil daftar worker...');
                const res = await axios.get(`${CLOUDFLARE_API_BASE_URL}/accounts/${state.accountId}/workers/scripts`, { headers: getCfHeaders(state.apiToken) });
                const workers = res.data.result;
                let text = '👷 *Daftar Worker Anda*\n\n';
                if (workers.length === 0) text += 'Tidak ada worker ditemukan.';
                else workers.forEach(w => { text += `- \`${w.id}\`\n`; });
                bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
                break;

            case 'worker_delete':
                // ... (logika hapus worker dengan try/catch di sekitar exec)
                break;

            default:
                bot.sendMessage(chatId, 'Fitur Worker ini belum diimplementasikan.');
                break;
        }
    } catch (error) {
        const errorMessage = error.response?.data?.errors?.[0]?.message || error.message;
        logger.error(`[Worker Handle] Error for ${chatId}: ${errorMessage}`);
        bot.sendMessage(chatId, `❌ Terjadi kesalahan pada fitur Worker: ${errorMessage}`);
    }
};

module.exports = {
    register,
    handle
};
