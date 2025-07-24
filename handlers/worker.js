const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { ensureLoggedInWorker } = require('./auth');

const CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';
const getCfHeaders = (apiToken) => ({ 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' });

const sendWorkerMenu = (bot, chatId) => {
    // ... (menu UI tetap sama)
};

const findJsFiles = (dir, baseDir, fileList = []) => {
    // ... (fungsi helper tetap sama)
};

const register = (bot, userState, logger) => {
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const state = userState[chatId];
        if (!state || !state.step || !state.step.startsWith('worker_')) return;

        try {
            const text = msg.text.trim();
            logger.info(`[Worker] ChatID: ${chatId}, Step: ${state.step}`);

            switch (state.step) {
                case 'worker_await_name':
                    state.workerName = text;
                    state.step = 'worker_await_repo';
                    bot.sendMessage(chatId, `✅ Nama worker: \`${text}\`\nSekarang, masukkan link repository GitHub:`);
                    break;
                case 'worker_await_repo':
                    state.repoUrl = text;
                    const repoName = path.basename(state.repoUrl, '.git');
                    const localRepoPath = path.join(__dirname, '..', 'temp_workers', repoName);
                    state.localRepoPath = localRepoPath;
                    if (fs.existsSync(localRepoPath)) fs.rmSync(localRepoPath, { recursive: true, force: true });

                    bot.sendMessage(chatId, `Mencoba meng-clone repository...`);
                    exec(`git clone ${state.repoUrl} ${localRepoPath}`, (err) => {
                        if (err) {
                            bot.sendMessage(chatId, `❌ Gagal clone: ${err.message}`);
                            delete userState[chatId];
                            return;
                        }
                        const jsFiles = findJsFiles(localRepoPath, localRepoPath);
                        if (jsFiles.length === 0) {
                            bot.sendMessage(chatId, '❌ Tidak ada file .js yang ditemukan di repository.');
                            delete userState[chatId];
                            return;
                        }
                        const keyboard = jsFiles.map(file => ([{ text: file, callback_data: `worker_set_entry_${file.replace(/\\/g, '/')}` }]));
                        bot.sendMessage(chatId, '✅ Repo berhasil di-clone. Pilih file entry point utama:', { reply_markup: { inline_keyboard: keyboard } });
                    });
                    break;
            }
        } catch (error) {
            logger.error(`[Worker Msg] ${error.stack}`);
            bot.sendMessage(chatId, `❌ Terjadi kesalahan: ${error.message}`);
            delete userState[chatId];
        }
    });
};

const handle = (bot, userState, callbackQuery, logger) => {
    const { data, message } = callbackQuery;
    const chatId = message.chat.id;

    const action = () => {
        // ... (semua logika handle yang ada dipindahkan ke sini)
    };

    ensureLoggedInWorker(bot, userState, chatId, action);
};

module.exports = { register, handle };
