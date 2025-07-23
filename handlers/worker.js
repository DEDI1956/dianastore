const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { ensureLoggedIn } = require('./auth');
const axios = require('axios'); // Dibutuhkan untuk list workers

const CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';

const getCfHeaders = (apiToken) => ({
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json'
});

const sendWorkerMenu = (bot, chatId, logger) => {
    logger.info(`Sending Worker menu to ${chatId}`);
    // ... (kode menu seperti sebelumnya)
};

const register = (bot, userState, logger) => {
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text.trim();
        const state = userState[chatId];

        if (!state || !state.step || !state.step.startsWith('worker_')) return;

        logger.info(`[Worker] ChatID: ${chatId}, Step: ${state.step}, Input: ${text}`);

        // ... (Logika untuk menangani input worker seperti nama, repo, dll.)
    });
};

const handle = (bot, userState, callbackQuery, logger) => {
    const { data, message } = callbackQuery;
    const chatId = message.chat.id;

    const action = () => {
        const state = userState[chatId];
        bot.answerCallbackQuery(callbackQuery.id).catch(err => logger.error(`answerCallbackQuery failed: ${err.stack}`));

        switch (data) {
            case 'worker_menu':
                sendWorkerMenu(bot, chatId, logger);
                break;

            case 'worker_list':
                 bot.sendMessage(chatId, `⏳ Mengambil daftar worker...`);
                 axios.get(`${CLOUDFLARE_API_BASE_URL}/accounts/${state.accountId}/workers/scripts`, { headers: getCfHeaders(state.apiToken) })
                    .then(response => {
                        // ... (logika untuk menampilkan daftar worker)
                    })
                    .catch(err => {
                        logger.error(`[Worker List] Error: ${err.stack}`);
                        bot.sendMessage(chatId, '❌ Gagal mengambil data.');
                    });
                break;

            // ... (Tambahkan case untuk deploy dan delete di sini)
        }
    };

    ensureLoggedIn(bot, userState, chatId, 'worker', action);
};

module.exports = {
    register,
    handle
};
