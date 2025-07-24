const { exec } = require('child_process');
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

const handleMessage = async (bot, userState, msg, logger) => {
    const chatId = msg.chat.id;
    const state = userState[chatId];
    const text = msg.text.trim();

    try {
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

                await bot.sendMessage(chatId, `Mencoba meng-clone repository...`);
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
                    delete state.step;
                });
                break;
        }
    } catch (error) {
        logger.error(`[Worker Msg] ${error.stack}`);
        bot.sendMessage(chatId, `❌ Terjadi kesalahan: ${error.message}`);
        delete userState[chatId].step;
    }
};

const handle = (bot, userState, callbackQuery, logger) => {
    const action = async () => {
        // ... (semua logika handle yang ada, dipindahkan ke sini)
    };
    ensureLoggedInWorker(bot, userState, callbackQuery.message.chat.id, action);
};

module.exports = { handleMessage, handle };
