const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { sendStartMessage } = require('./start');
const axios = require('axios');

const CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';

// --- Fungsi Helper ---
const getCfHeaders = (apiToken) => ({
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json'
});

const isValidWorkerName = (name) => /^[a-z0-9-]+$/.test(name);

let wranglerChecked = false;
const checkAndInstallWrangler = (bot, chatId) => {
    if (wranglerChecked) return true;
    try {
        execSync('wrangler --version');
        wranglerChecked = true;
        return true;
    } catch (error) {
        bot.sendMessage(chatId, '`wrangler` tidak ditemukan. Memasang `wrangler`...');
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
━━━━━━━━━━━━━━━━━━`;
    const options = {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '1️⃣ Deploy Worker via Github', callback_data: 'worker_deploy_github' }],
                [{ text: '2️⃣ List Worker', callback_data: 'worker_list' }],
                [{ text: '3️⃣ 🗑️ Hapus Worker', callback_data: 'worker_delete' }],
                [{ text: '🔙 Kembali', callback_data: 'main_menu' }, { text: '🚪 Logout', callback_data: 'logout' }]
            ]
        }
    };
    bot.sendMessage(chatId, text, options);
};

// --- Logika Utama Handler ---
module.exports = (bot, userState) => {
    // Listener untuk pesan, menangani input kredensial dan lainnya
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text.trim();

        if (!userState[chatId] || !userState[chatId].step) return;

        const state = userState[chatId];
        console.log(`[DEBUG] Chat ID: ${chatId}, Step: ${state.step}, Input: ${text}`);

        try {
            switch (state.step) {
                // --- Alur Login Global ---
                case 'awaiting_worker_token':
                    state.apiToken = text;
                    state.step = 'awaiting_worker_account_id';
                    bot.sendMessage(chatId, 'API Token diterima. Sekarang masukkan Account ID Cloudflare Anda:');
                    break;
                case 'awaiting_worker_account_id':
                    state.accountId = text;
                    bot.sendMessage(chatId, 'Memvalidasi kredensial...');
                    await axios.get(`${CLOUDFLARE_API_BASE_URL}/accounts/${state.accountId}/workers/scripts`, { headers: getCfHeaders(state.apiToken) });

                    bot.sendMessage(chatId, `✅ Login Worker berhasil untuk Akun ID: ${state.accountId}`);

                    // Lanjutkan ke callback yang dituju setelah login
                    const nextCallback = state.nextCallback;
                    delete state.step; // Hapus state login
                    if (nextCallback) {
                        delete state.nextCallback;
                        module.exports.handleCallback(bot, userState, { message: msg, data: nextCallback, from: {id: chatId} });
                    } else {
                        sendWorkerMenu(bot, chatId, `ID ${state.accountId}`);
                    }
                    break;

                // --- Alur Deploy ---
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
                    const localRepoPath = path.join(__dirname, '..', 'temp_workers', repoName);

                    if (fs.existsSync(localRepoPath)) {
                        fs.rmSync(localRepoPath, { recursive: true, force: true });
                    }

                    bot.sendMessage(chatId, `Mencoba meng-clone repository dari ${state.repoUrl}...`);
                    exec(`git clone ${state.repoUrl} ${localRepoPath}`, (error) => {
                        if (error) {
                            bot.sendMessage(chatId, `❌ Gagal meng-clone repository: ${error.message}`);
                            delete state.step;
                            return;
                        }

                        bot.sendMessage(chatId, '✅ Repo berhasil di-clone. Mengecek `wrangler.toml`...');
                        const wranglerTomlPath = path.join(localRepoPath, 'wrangler.toml');
                        if (!fs.existsSync(wranglerTomlPath)) {
                            bot.sendMessage(chatId, '`wrangler.toml` tidak ditemukan. Membuat file baru...');
                            const mainScript = ['index.js', 'worker.js', 'src/index.js'].find(f => fs.existsSync(path.join(localRepoPath, f))) || 'index.js';
                            const wranglerConfig = `name = "${state.workerName}"\nmain = "${mainScript}"\naccount_id = "${state.accountId}"\nworkers_dev = true\n`;
                            fs.writeFileSync(wranglerTomlPath, wranglerConfig);
                            bot.sendMessage(chatId, `✅ \`wrangler.toml\` berhasil dibuat.`);
                        } else {
                            bot.sendMessage(chatId, '✅ `wrangler.toml` sudah ada.');
                        }

                        bot.sendMessage(chatId, 'Mempersiapkan untuk deploy dengan `wrangler`...');
                        const deployCommand = `cd ${localRepoPath} && CLOUDFLARE_API_TOKEN=${state.apiToken} wrangler deploy`;

                        exec(deployCommand, (deployError, stdout, stderr) => {
                            if (deployError) {
                                bot.sendMessage(chatId, `❌ Deploy gagal:\n\`\`\`\n${stderr}\n\`\`\``, { parse_mode: 'Markdown' });
                            } else {
                                bot.sendMessage(chatId, `✅ **Deploy Berhasil**\n\`\`\`\n${stdout}\n\`\`\``, { parse_mode: 'Markdown' });
                            }
                            fs.rmSync(localRepoPath, { recursive: true, force: true });
                            delete state.step;
                            sendWorkerMenu(bot, chatId, `ID ${state.accountId}`);
                        });
                    });
                    break;
            }
        } catch (error) {
            const errorMessage = error.response?.data?.errors?.[0]?.message || error.message || 'Terjadi kesalahan tidak diketahui.';
            bot.sendMessage(chatId, `❌ Terjadi kesalahan: ${errorMessage}`);
            delete state.step;
        }
    });
};

// --- Handler untuk Callback Query ---
module.exports.handleCallback = async (bot, userState, callbackQuery) => {
    // ... (kode yang sama seperti sebelumnya untuk parsing callbackQuery)
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const chatId = msg.chat.id;

    bot.answerCallbackQuery(callbackQuery.id).catch(console.error);
    const state = userState[chatId] || {};

    const ensureLogin = (nextCallback) => {
        if (state.apiToken && state.accountId) {
            // Jika sudah login, langsung jalankan callback berikutnya
            module.exports.handleCallback(bot, userState, { ...callbackQuery, data: nextCallback });
        } else {
            // Jika belum, mulai alur login
            userState[chatId] = { step: 'awaiting_worker_token', nextCallback };
            bot.sendMessage(chatId, 'Untuk melanjutkan, silakan masukkan API Token Cloudflare Anda:');
        }
    };

    try {
        // ... (kode untuk delete confirm dan execute tetap sama)

        switch (data) {
            case 'worker_menu':
                ensureLogin('worker_menu_loggedin');
                break;
            case 'worker_menu_loggedin':
                sendWorkerMenu(bot, chatId, `ID ${state.accountId}`);
                break;

            case 'worker_deploy_github':
                // Alur baru: selalu mulai dengan login untuk deploy
                ensureLogin('worker_deploy_github_loggedin');
                break;
            case 'worker_deploy_github_loggedin':
                // Setelah login dikonfirmasi, cek wrangler dan minta nama worker
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
                // ... logika list worker
                break;

            case 'worker_delete':
                ensureLogin('worker_delete_loggedin');
                break;
            case 'worker_delete_loggedin':
                // ... logika delete worker
                break;
        }
    } catch (error) {
        const errorMessage = error.response?.data?.errors?.[0]?.message || error.message || 'Terjadi kesalahan.';
        bot.sendMessage(chatId, `❌ Terjadi kesalahan: ${errorMessage}`);
    }
};
