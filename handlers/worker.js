const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';

const getCfHeaders = (apiToken) => ({
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json'
});

const sendWorkerMenu = (bot, chatId) => {
    // ... (kode menu seperti sebelumnya)
};

const register = (bot, userState, logger) => {
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text.trim();
        const state = userState[chatId];

        if (!state || !state.step) return;

        if (state.step === 'awaiting_worker_token') {
            logger.info(`[Worker Auth] ChatID: ${chatId}, Step: ${state.step}`);
            bot.sendMessage(chatId, 'Memverifikasi token...');
            try {
                const verifyResponse = await axios.get(`${CLOUDFLARE_API_BASE_URL}/user`, { headers: getCfHeaders(text) });

                state.apiToken = text;
                // Untuk worker, kita hanya butuh account ID, yang bisa kita dapatkan dari endpoint lain atau minta
                state.step = 'awaiting_worker_account_id';
                bot.sendMessage(chatId, `✅ Token valid untuk ${verifyResponse.data.result.email}!\nSekarang masukkan Account ID Anda:`);

            } catch (error) {
                logger.error(`[Worker Auth] Invalid token for ${chatId}: ${error.message}`);
                bot.sendMessage(chatId, '❌ Token tidak valid. Silakan coba lagi.');
            }
        } else if (state.step === 'awaiting_worker_account_id') {
            state.accountId = text;
            delete state.step;
            bot.sendMessage(chatId, '✅ Login berhasil!');
            if (state.nextCallback) {
                const originalCallback = state.nextCallback;
                delete state.nextCallback;
                handle(bot, userState, originalCallback, logger);
            } else {
                sendWorkerMenu(bot, chatId);
            }
        }
        // ... logika untuk step worker lainnya ...
    });
};

const handle = (bot, userState, callbackQuery, logger) => {
    const { data, message } = callbackQuery;
    const chatId = message.chat.id;

    bot.answerCallbackQuery(callbackQuery.id).catch(err => logger.error(`[Worker] answerCallbackQuery failed: ${err.stack}`));

    const state = userState[chatId] || {};

    if (!state.apiToken || !state.accountId) {
        logger.info(`[Worker] Unauthenticated user ${chatId} trying to access ${data}.`);
        userState[chatId] = {
            step: 'awaiting_worker_token',
            nextCallback: callbackQuery
        };
        bot.sendMessage(chatId, 'Anda harus login untuk menggunakan fitur ini. Silakan masukkan API Token Cloudflare Anda:');
        return;
    }

    logger.info(`[Worker] Authenticated user ${chatId} accessing ${data}.`);

    switch (data) {
        case 'worker_menu':
            sendWorkerMenu(bot, chatId);
            break;

        case 'worker_list':
            bot.sendMessage(chatId, '⏳ Mengambil daftar worker...');
            axios.get(`${CLOUDFLARE_API_BASE_URL}/accounts/${state.accountId}/workers/scripts`, { headers: getCfHeaders(state.apiToken) })
                .then(res => {
                    const workers = res.data.result;
                    let text = '👷 *Daftar Worker Anda*\n\n';
                    if (workers.length === 0) text += 'Tidak ada worker ditemukan.';
                    else workers.forEach(w => { text += `- \`${w.id}\`\n`; });
                    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
                })
                .catch(err => {
                    logger.error(`[Worker List] Error: ${err.stack}`);
                    bot.sendMessage(chatId, '❌ Gagal mengambil daftar worker.');
                });
            break;
        // ... (implementasi untuk deploy, delete)
        default:
            bot.sendMessage(chatId, 'Fitur belum diimplementasikan.');
            break;
    }
};

module.exports = {
    register,
    handle
};
