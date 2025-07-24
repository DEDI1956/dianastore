const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { ensureLoggedIn } = require('./auth');

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
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            if (file !== 'node_modules') findJsFiles(filePath, baseDir, fileList);
        } else if (file.endsWith('.js')) {
            fileList.push(path.relative(baseDir, filePath));
        }
    });
    return fileList;
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
        bot.answerCallbackQuery(callbackQuery.id).catch(err => logger.error(`[Worker] answerCallbackQuery failed: ${err.stack}`));
        const state = userState[chatId];

        try {
            if (data.startsWith('worker_set_entry_')) {
                const entryPoint = data.replace('worker_set_entry_', '');
                state.entryPoint = entryPoint;
                bot.editMessageText(`✅ Entry point diatur ke: \`${entryPoint}\`\n\nMemulai proses deploy...`, { chat_id: chatId, message_id: message.message_id });

                const wranglerTomlPath = path.join(state.localRepoPath, 'wrangler.toml');
                const wranglerConfig = `name = "${state.workerName}"\nmain = "${state.entryPoint}"\naccount_id = "${state.accountId}"\nworkers_dev = true\n`;
                fs.writeFileSync(wranglerTomlPath, wranglerConfig);

                const deployCommand = `cd "${state.localRepoPath}" && CLOUDFLARE_API_TOKEN=${state.apiToken} wrangler deploy`;
                exec(deployCommand, (err, stdout, stderr) => {
                    if (err) {
                        bot.sendMessage(chatId, `❌ Deploy gagal:\n\`\`\`\n${stderr}\n\`\`\``, { parse_mode: 'Markdown' });
                    } else {
                        bot.sendMessage(chatId, `✅ **Deploy Berhasil**\n\`\`\`\n${stdout}\n\`\`\``, { parse_mode: 'Markdown' });
                    }
                    fs.rmSync(state.localRepoPath, { recursive: true, force: true });
                    delete userState[chatId];
                    sendWorkerMenu(bot, chatId);
                });
                return;
            }
            if (data.startsWith('worker_delete_confirm_')) {
                const workerName = data.replace('worker_delete_confirm_', '');
                 bot.editMessageText(`Yakin ingin menghapus worker \`${workerName}\`?`, {
                    chat_id: chatId, message_id: message.message_id, parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: '✅ Ya, Hapus', callback_data: `worker_delete_execute_${workerName}` }, { text: '❌ Batal', callback_data: 'worker_menu' }]] }
                });
                return;
            }
             if (data.startsWith('worker_delete_execute_')) {
                const workerName = data.replace('worker_delete_execute_', '');
                bot.editMessageText(`Menghapus worker \`${workerName}\`...`, { chat_id: chatId, message_id: message.message_id, parse_mode: 'Markdown' });
                const command = `CLOUDFLARE_API_TOKEN=${state.apiToken} wrangler delete ${workerName} --account-id ${state.accountId}`;
                exec(command, (err, stdout, stderr) => {
                    if (err) {
                         bot.sendMessage(chatId, `❌ Gagal menghapus worker:\n\`\`\`\n${stderr}\n\`\`\``, { parse_mode: 'Markdown' });
                    } else {
                        bot.sendMessage(chatId, `✅ Worker \`${workerName}\` berhasil dihapus.`);
                    }
                    sendWorkerMenu(bot, chatId);
                });
                return;
            }

            switch (data) {
                case 'worker_menu': sendWorkerMenu(bot, chatId); break;
                case 'worker_deploy':
                    userState[chatId] = { ...state, step: 'worker_await_name' };
                    bot.sendMessage(chatId, "Masukkan nama untuk Worker Anda (contoh: `my-cool-worker`):");
                    break;
                case 'worker_list':
                case 'worker_delete':
                    bot.sendMessage(chatId, `⏳ Mengambil daftar worker...`);
                    axios.get(`${CLOUDFLARE_API_BASE_URL}/accounts/${state.accountId}/workers/scripts`, { headers: getCfHeaders(state.apiToken) })
                        .then(res => {
                            const workers = res.data.result;
                            if (workers.length === 0) {
                                bot.sendMessage(chatId, 'Tidak ada worker ditemukan.');
                                return;
                            }
                            if (data === 'worker_delete') {
                                const keyboard = workers.map(w => ([{ text: w.id, callback_data: `worker_delete_confirm_${w.id}` }]));
                                bot.sendMessage(chatId, 'Pilih worker untuk dihapus:', { reply_markup: { inline_keyboard: keyboard } });
                            } else {
                                let text = '👷 *Daftar Worker Anda*\n\n';
                                workers.forEach(w => { text += `- \`${w.id}\`\n`; });
                                bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
                            }
                        }).catch(err => { throw err; });
                    break;
            }
        } catch (error) {
            logger.error(`[Worker Handle] ${error.stack}`);
            bot.sendMessage(chatId, `❌ Terjadi kesalahan pada fitur Worker: ${error.message}`);
        }
    };

    ensureLoggedIn(bot, userState, chatId, 'worker', action);
};

module.exports = { register, handle };
