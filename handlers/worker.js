const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { sendStartMessage } = require('./start');
const axios = require('axios'); // Masih digunakan untuk list workers

const CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';

// --- Fungsi Helper ---
const getCfHeaders = (apiToken) => ({
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json'
});

const isValidWorkerName = (name) => {
    const regex = /^[a-z0-9-]+$/;
    return regex.test(name);
};

let wranglerChecked = false;
const checkAndInstallWrangler = (bot, chatId) => {
    if (wranglerChecked) return true;

    try {
        execSync('wrangler --version');
        bot.sendMessage(chatId, '✅ `wrangler` sudah terpasang.');
        wranglerChecked = true;
        return true;
    } catch (error) {
        bot.sendMessage(chatId, '`wrangler` tidak ditemukan. Memasang `wrangler` secara global, ini mungkin memakan waktu beberapa saat...');
        try {
            execSync('npm install -g wrangler');
            bot.sendMessage(chatId, '✅ `wrangler` berhasil dipasang.');
            wranglerChecked = true;
            return true;
        } catch (installError) {
            bot.sendMessage(chatId, `❌ Gagal memasang \`wrangler\`: ${installError.message}`);
            return false;
        }
    }
};

// --- Fungsi Menu ---
const sendWorkerMenu = (bot, chatId, accountIdentifier) => {
    const text = `\
━━━━━━━━━━━━━━━━━━
✅ *Login Worker Berhasil*

👤 Akun: ${accountIdentifier}

Pilih aksi:
1️⃣ Deploy Worker via Github
2️⃣ List Worker
━━━━━━━━━━━━━━━━━━`;
    const options = {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '1️⃣ Deploy Worker via Github', callback_data: 'worker_deploy_github' }],
                [{ text: '2️⃣ List Worker', callback_data: 'worker_list' }],
                [{ text: '🔙 Kembali ke menu utama', callback_data: 'main_menu' }]
            ]
        }
    };
    bot.sendMessage(chatId, text, options);
};

// --- Logika Utama Handler ---
module.exports = (bot, userState) => {
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text.trim();

        if (!userState[chatId] || !userState[chatId].step) return;

        const state = userState[chatId];
        const localRepoPath = state.repoUrl ? path.join(__dirname, '..', 'temp_workers', path.basename(state.repoUrl, '.git')) : null;

        try {
            switch (state.step) {
                case 'awaiting_worker_token':
                     state.apiToken = text;
                    state.step = 'awaiting_worker_account_id';
                    bot.sendMessage(chatId, 'API Token diterima. Sekarang masukkan Account ID Cloudflare Anda:');
                    break;
                case 'awaiting_worker_account_id':
                    state.accountId = text;
                    bot.sendMessage(chatId, 'Memvalidasi kredensial...');
                     await axios.get(`${CLOUDFLARE_API_BASE_URL}/accounts/${state.accountId}/workers/scripts`, {
                        headers: getCfHeaders(state.apiToken)
                    });
                    bot.sendMessage(chatId, `✅ Login Worker berhasil untuk Akun ID: ${state.accountId}`);
                    state.step = 'worker_menu';
                    sendWorkerMenu(bot, chatId, `ID ${state.accountId}`);
                    break;

                case 'worker_deploy_name':
                    if (!isValidWorkerName(text)) {
                        bot.sendMessage(chatId, "❌ Nama Worker tidak valid. Gunakan huruf kecil, angka, dan dash `-` saja. Silakan masukkan ulang:");
                        return;
                    }
                    state.workerName = text;
                    state.step = 'worker_deploy_repo';
                    bot.sendMessage(chatId, `✅ Nama Worker diterima: \`${state.workerName}\`\nSekarang, masukkan link repository GitHub:`);
                    break;

                case 'worker_deploy_repo':
                    state.repoUrl = text;
                    const repoName = path.basename(state.repoUrl, '.git');
                    const newLocalRepoPath = path.join(__dirname, '..', 'temp_workers', repoName);

                    if (fs.existsSync(newLocalRepoPath)) {
                        fs.rmSync(newLocalRepoPath, { recursive: true, force: true });
                    }

                    bot.sendMessage(chatId, `Mencoba meng-clone repository dari ${state.repoUrl}...`);
                    exec(`git clone ${state.repoUrl} ${newLocalRepoPath}`, (error) => {
                        if (error) {
                             bot.sendMessage(chatId, `❌ Gagal meng-clone repository: ${error.message}`);
                             delete userState[chatId].step;
                             return;
                        }

                        bot.sendMessage(chatId, '✅ Repo berhasil di-clone. Mengecek `wrangler.toml`...');

                        const wranglerTomlPath = path.join(newLocalRepoPath, 'wrangler.toml');
                        if (!fs.existsSync(wranglerTomlPath)) {
                            bot.sendMessage(chatId, '`wrangler.toml` tidak ditemukan. Membuat file baru...');
                            const mainScript = ['index.js', 'worker.js', 'src/index.js'].find(f => fs.existsSync(path.join(newLocalRepoPath, f))) || 'index.js';
                            const wranglerConfig = `name = "${state.workerName}"\nmain = "${mainScript}"\naccount_id = "${state.accountId}"\nworkers_dev = true\n`;
                            fs.writeFileSync(wranglerTomlPath, wranglerConfig);
                             bot.sendMessage(chatId, `✅ \`wrangler.toml\` berhasil dibuat.`);
                        } else {
                            bot.sendMessage(chatId, '✅ `wrangler.toml` sudah ada.');
                        }

                        // Untuk sekarang, kita skip deteksi ENV otomatis dan langsung deploy
                        // Implementasi ENV akan ditambahkan jika diperlukan

                        bot.sendMessage(chatId, 'Mempersiapkan untuk deploy dengan `wrangler`...');

                        const deployCommand = `cd ${newLocalRepoPath} && CLOUDFLARE_API_TOKEN=${state.apiToken} wrangler deploy`;

                        exec(deployCommand, (deployError, stdout, stderr) => {
                             if (deployError) {
                                bot.sendMessage(chatId, `❌ Deploy gagal:\n\`\`\`\n${stderr}\n\`\`\``, { parse_mode: 'Markdown' });
                            } else {
                                bot.sendMessage(chatId, `✅ **Deploy Berhasil**\n\`\`\`\n${stdout}\n\`\`\``, { parse_mode: 'Markdown' });
                            }
                             fs.rmSync(newLocalRepoPath, { recursive: true, force: true });
                             const preservedState = { apiToken: state.apiToken, accountId: state.accountId };
                             userState[chatId] = { ...preservedState, step: 'worker_menu' };
                             sendWorkerMenu(bot, chatId, `ID ${state.accountId}`);
                        });
                    });
                    break;
            }
        } catch (error) {
            const errorMessage = error.response?.data?.errors?.[0]?.message || error.message || 'Terjadi kesalahan tidak diketahui.';
            bot.sendMessage(chatId, `❌ Terjadi kesalahan: ${errorMessage}`);
            delete userState[chatId];
        }
    });
};

// --- Handler untuk Callback Query ---
module.exports.handleCallback = async (bot, userState, callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const chatId = msg.chat.id;

    bot.answerCallbackQuery(callbackQuery.id);
    const state = userState[chatId] || {};

    const ensureLogin = (nextCallback) => {
        if (state.apiToken && state.accountId) {
            module.exports.handleCallback(bot, userState, { ...callbackQuery, data: nextCallback });
        } else {
            userState[chatId] = { step: 'awaiting_worker_token', nextCallback };
            bot.sendMessage(chatId, 'Silakan masukkan API Token Cloudflare Anda:');
        }
    };

    try {
        switch (data) {
            case 'worker_menu':
                ensureLogin('worker_menu_loggedin');
                break;
            case 'worker_menu_loggedin':
                sendWorkerMenu(bot, chatId, `ID ${state.accountId}`);
                break;

            case 'worker_deploy_github':
                ensureLogin('worker_deploy_github_loggedin');
                break;
            case 'worker_deploy_github_loggedin':
                if (!checkAndInstallWrangler(bot, chatId)) {
                    sendStartMessage(bot, chatId);
                    return;
                }
                userState[chatId] = { ...state, step: 'worker_deploy_name' };
                bot.sendMessage(chatId, "Masukkan nama Worker Anda (hanya huruf kecil, angka, dan dash `-`):");
                break;

            case 'worker_list':
                 ensureLogin('worker_list_loggedin');
                break;
            case 'worker_list_loggedin':
                 const res = await axios.get(`${CLOUDFLARE_API_BASE_URL}/accounts/${state.accountId}/workers/scripts`, {
                    headers: getCfHeaders(state.apiToken)
                });
                // ... (sisa kode list worker sama seperti sebelumnya)
                const workers = res.data.result;
                let listText = "👷 *Daftar Worker Anda*\n\n";
                if (workers.length === 0) {
                    listText += 'Tidak ada worker yang ditemukan.';
                } else {
                     const subdomainRes = await axios.get(`${CLOUDFLARE_API_BASE_URL}/accounts/${state.accountId}/workers/subdomain`, { headers: getCfHeaders(state.apiToken) });
                    const subdomain = subdomainRes.data.result.subdomain;
                    workers.forEach((worker, index) => {
                        listText += `${index + 1}. *${worker.id}*\n   - URL: https://${worker.id}.${subdomain}.workers.dev\n`;
                    });
                }
                 bot.sendMessage(chatId, listText, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'worker_menu_loggedin' }]] } });
                break;
        }
    } catch (error) {
        const errorMessage = error.response?.data?.errors?.[0]?.message || 'Terjadi kesalahan tidak diketahui.';
        bot.sendMessage(chatId, `❌ Terjadi kesalahan: ${errorMessage}.`);
        delete userState[chatId];
    }
};
