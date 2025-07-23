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
    const text = `━━━━━━━━━━━━━━━━━━\n⚙️ *Menu Worker*\nPilih salah satu opsi:\n━━━━━━━━━━━━━━━━━━`;
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

const checkAndInstallWrangler = (bot, chatId, logger) => {
    try {
        logger.info('Checking for wrangler...');
        execSync('wrangler --version');
        logger.info('Wrangler is already installed.');
        return true;
    } catch (error) {
        bot.sendMessage(chatId, '`wrangler` tidak ditemukan. Memasang `wrangler` secara global, ini mungkin memakan waktu...');
        try {
            execSync('npm install -g wrangler');
            bot.sendMessage(chatId, '✅ `wrangler` berhasil dipasang.');
            logger.info('Wrangler installed successfully.');
            return true;
        } catch (installError) {
            logger.error(`Failed to install wrangler: ${installError.stack}`);
            bot.sendMessage(chatId, `❌ Gagal memasang \`wrangler\`: ${installError.message}`);
            return false;
        }
    }
};


const register = (bot, userState, logger) => {
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const state = userState[chatId];
        if (!state || !state.step || !state.step.startsWith('worker_await_')) return;

        try {
            const text = msg.text.trim();
            logger.info(`[Worker] ChatID: ${chatId}, Step: ${state.step}`);

            switch (state.step) {
                case 'worker_await_token':
                    await axios.get(`${CLOUDFLARE_API_BASE_URL}/user`, { headers: getCfHeaders(text) });
                    state.apiToken = text;
                    state.step = 'worker_await_account_id';
                    bot.sendMessage(chatId, '✅ Token valid. Masukkan Account ID:');
                    break;
                case 'worker_await_account_id':
                    state.accountId = text;
                    await axios.get(`${CLOUDFLARE_API_BASE_URL}/accounts/${state.accountId}`, { headers: getCfHeaders(state.apiToken) });
                    bot.sendMessage(chatId, `✅ Login Worker berhasil!`);
                    delete state.step;
                    if (state.nextCallback) {
                        const cb = state.nextCallback;
                        delete state.nextCallback;
                        handle(bot, userState, cb, logger);
                    } else {
                        sendWorkerMenu(bot, chatId);
                    }
                    break;
                case 'worker_await_name':
                    state.workerName = text;
                    state.step = 'worker_await_repo';
                    bot.sendMessage(chatId, `✅ Nama worker: \`${text}\`\nMasukkan link repository GitHub:`);
                    break;
                case 'worker_await_repo':
                    state.repoUrl = text;
                    bot.sendMessage(chatId, `Mencoba deploy \`${state.workerName}\` dari \`${state.repoUrl}\`...`);
                    const repoName = path.basename(state.repoUrl, '.git');
                    const localRepoPath = path.join(__dirname, '..', 'temp_workers', repoName);
                    if (fs.existsSync(localRepoPath)) fs.rmSync(localRepoPath, { recursive: true, force: true });

                    exec(`git clone ${state.repoUrl} ${localRepoPath}`, (cloneErr) => {
                        if (cloneErr) throw cloneErr;
                        const wranglerTomlPath = path.join(localRepoPath, 'wrangler.toml');
                        if (!fs.existsSync(wranglerTomlPath)) {
                            const mainScript = ['index.js', 'worker.js', 'src/index.js'].find(f => fs.existsSync(path.join(localRepoPath, f))) || 'index.js';
                            const wranglerConfig = `name = "${state.workerName}"\nmain = "${mainScript}"\naccount_id = "${state.accountId}"\nworkers_dev = true\n`;
                            fs.writeFileSync(wranglerTomlPath, wranglerConfig);
                        }
                        const deployCommand = `cd ${localRepoPath} && CLOUDFLARE_API_TOKEN=${state.apiToken} wrangler deploy`;
                        exec(deployCommand, (deployErr, stdout, stderr) => {
                            if (deployErr) {
                                bot.sendMessage(chatId, `❌ Deploy gagal:\n\`\`\`\n${stderr}\n\`\`\``, { parse_mode: 'Markdown' });
                            } else {
                                bot.sendMessage(chatId, `✅ **Deploy Berhasil**\n\`\`\`\n${stdout}\n\`\`\``, { parse_mode: 'Markdown' });
                            }
                            fs.rmSync(localRepoPath, { recursive: true, force: true });
                            delete state.step; delete state.workerName; delete state.repoUrl;
                            sendWorkerMenu(bot, chatId);
                        });
                    });
                    break;
            }
        } catch (error) {
            const errorMessage = error.response?.data?.errors?.[0]?.message || error.message;
            logger.error(`[Worker Message] Error for ${chatId}: ${errorMessage}`);
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
        userState[chatId] = { ...state, step: 'worker_await_token', nextCallback: callbackQuery };
        bot.sendMessage(chatId, 'Anda perlu login untuk fitur Worker. Silakan masukkan API Token Cloudflare Anda:');
        return;
    }

    try {
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
                if (err) throw new Error(stderr);
                bot.sendMessage(chatId, `✅ Worker \`${workerName}\` berhasil dihapus.`);
                sendWorkerMenu(bot, chatId);
            });
            return;
        }

        switch (data) {
            case 'worker_menu': sendWorkerMenu(bot, chatId); break;
            case 'worker_deploy':
                if (checkAndInstallWrangler(bot, chatId, logger)) {
                    userState[chatId] = { ...state, step: 'worker_await_name' };
                    bot.sendMessage(chatId, "Masukkan nama untuk Worker Anda:");
                }
                break;
            case 'worker_list':
            case 'worker_delete':
                bot.sendMessage(chatId, `⏳ Mengambil daftar worker...`);
                const res = await axios.get(`${CLOUDFLARE_API_BASE_URL}/accounts/${state.accountId}/workers/scripts`, { headers: getCfHeaders(state.apiToken) });
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
                break;
        }
    } catch (error) {
        const errorMessage = error.response?.data?.errors?.[0]?.message || error.message;
        logger.error(`[Worker Handle] Error for ${chatId}: ${errorMessage}`);
        bot.sendMessage(chatId, `❌ Terjadi kesalahan pada fitur Worker: ${errorMessage}`);
    }
};

module.exports = { register, handle };
