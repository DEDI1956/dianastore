const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { ensureLoggedInWorker } = require('./auth');

const CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';
const getCfHeaders = (apiToken) => ({ 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' });

const sendWorkerMenu = (bot, chatId) => {
    const text = `⚙️ *Menu Worker*\nPilih salah satu opsi:`;
    bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '1️⃣ Deploy Worker via GitHub', callback_data: 'worker_deploy' }],
                [{ text: '2️⃣ List Workers', callback_data: 'worker_list' }],
                [{ text: '3️⃣ 🗑️ Hapus Worker', callback_data: 'worker_delete' }],
                [{ text: '🔙 Kembali', callback_data: 'main_menu' }, { text: '🚪 Logout', callback_data: 'logout' }]
            ]
        }
    });
};

const findJsFiles = (dir, baseDir, fileList = []) => {
    // ... (fungsi helper tetap sama)
};

const register = (bot, userState, logger) => {
    // ... (logika register tetap sama)
};

const handle = (bot, userState, callbackQuery, logger) => {
    const { data, message } = callbackQuery;
    const chatId = message.chat.id;

    const action = () => {
        bot.answerCallbackQuery(callbackQuery.id).catch(err => logger.error(`[Worker] answerCallbackQuery failed: ${err.stack}`));
        const state = userState[chatId];

        try {
            if (data.startsWith('worker_set_entry_')) {
                // ... (logika set entry point)
                return;
            }
            if (data.startsWith('worker_delete_confirm_')) {
                // ... (logika konfirmasi hapus)
                return;
            }
            if (data.startsWith('worker_delete_execute_')) {
                // ... (logika eksekusi hapus)
                return;
            }

            switch (data) {
                case 'worker_menu': sendWorkerMenu(bot, chatId); break;
                case 'worker_deploy':
                    // ... (logika deploy)
                    break;
                case 'worker_list':
                case 'worker_delete':
                    // ... (logika list/delete)
                    break;
            }
        } catch (error) {
            logger.error(`[Worker Handle] ${error.stack}`);
            bot.sendMessage(chatId, `❌ Terjadi kesalahan pada fitur Worker: ${error.message}`);
        }
    };

    ensureLoggedInWorker(bot, userState, chatId, action);
};

module.exports = { register, handle };
