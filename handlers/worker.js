const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { sendStartMessage } = require('./start');

const CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';

// --- Fungsi Helper ---
const getCfHeaders = (apiToken, contentType = 'application/json') => ({
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': contentType
});

const isValidWorkerName = (name) => {
    const regex = /^[a-z0-9-]+$/;
    return regex.test(name);
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

        try {
            switch (state.step) {
                // --- Alur Login Worker ---
                case 'awaiting_worker_token':
                    state.apiToken = text;
                    state.step = 'awaiting_worker_account_id';
                    bot.sendMessage(chatId, 'API Token diterima. Sekarang masukkan Account ID Cloudflare Anda:');
                    break;
                case 'awaiting_worker_account_id':
                    state.accountId = text;
                    bot.sendMessage(chatId, 'Memvalidasi kredensial...');
                    // Validasi dengan mencoba mengambil daftar worker
                    await axios.get(`${CLOUDFLARE_API_BASE_URL}/accounts/${state.accountId}/workers/scripts`, {
                        headers: getCfHeaders(state.apiToken)
                    });
                    bot.sendMessage(chatId, `✅ Login Worker berhasil untuk Akun ID: ${state.accountId}`);
                    state.step = 'worker_menu';
                    sendWorkerMenu(bot, chatId, `ID ${state.accountId}`);
                    break;

                // --- Alur Deploy Baru ---
                case 'worker_deploy_name':
                    if (!isValidWorkerName(text)) {
                        bot.sendMessage(chatId, "❌ Nama Worker tidak valid. Gunakan huruf kecil, angka, dan dash `-` saja, tanpa spasi atau simbol lain. Silakan masukkan ulang:");
                        return; // Tetap di step yang sama
                    }
                    state.workerName = text;
                    state.step = 'worker_deploy_repo';
                    bot.sendMessage(chatId, `✅ Nama Worker diterima: \`${state.workerName}\`\nSekarang, masukkan link repository GitHub untuk Worker yang ingin Anda deploy:`);
                    break;

                case 'worker_deploy_repo':
                    state.repoUrl = text;
                    const repoName = path.basename(state.repoUrl, '.git');
                    const localRepoPath = path.join(__dirname, '..', 'temp_workers', repoName);

                    bot.sendMessage(chatId, `Mencoba meng-clone repository dari ${state.repoUrl}...`);

                    // Hapus direktori lama jika ada
                    if (fs.existsSync(localRepoPath)) {
                        fs.rmSync(localRepoPath, { recursive: true, force: true });
                    }

                    exec(`git clone ${state.repoUrl} ${localRepoPath}`, async (error, stdout, stderr) => {
                        if (error) {
                            bot.sendMessage(chatId, `❌ Gagal meng-clone repository: ${stderr}`, {
                                reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali ke menu Worker', callback_data: 'worker_menu_loggedin' }]] }
                            });
                            delete state.step;
                            return;
                        }

                        bot.sendMessage(chatId, '✅ Repository berhasil di-clone. Membaca file worker...');

                        const files = fs.readdirSync(localRepoPath);
                        const jsFile = files.find(f => f.endsWith('.js') && (f === 'index.js' || f === 'worker.js' || f === 'src/index.js'));

                        if (!jsFile) {
                            bot.sendMessage(chatId, '❌ Tidak dapat menemukan file worker utama (index.js, worker.js, atau src/index.js).', {
                                reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali ke menu Worker', callback_data: 'worker_menu_loggedin' }]] }
                            });
                            fs.rmSync(localRepoPath, { recursive: true, force: true });
                            delete state.step;
                            return;
                        }

                        const scriptContent = fs.readFileSync(path.join(localRepoPath, jsFile), 'utf-8');

                        bot.sendMessage(chatId, `Mendeploy worker dengan nama \`${state.workerName}\`...`);

                        try {
                            await axios.put(
                                `${CLOUDFLARE_API_BASE_URL}/accounts/${state.accountId}/workers/scripts/${state.workerName}`,
                                scriptContent,
                                { headers: getCfHeaders(state.apiToken, 'application/javascript') }
                            );

                            const successText = `\
━━━━━━━━━━━━━━━━━━
✅ *Worker Berhasil Dideploy*

📄 Nama Worker: \`${state.workerName}\`
🔗 Repository: \`${state.repoUrl}\`
✅ Status: Sukses
━━━━━━━━━━━━━━━━━━`;
                            bot.sendMessage(chatId, successText, {
                                parse_mode: 'Markdown',
                                reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali ke menu Worker', callback_data: 'worker_menu_loggedin' }]] }
                            });

                        } catch (deployError) {
                            const errorMessage = deployError.response?.data?.errors?.[0]?.message || 'Terjadi kesalahan tidak diketahui.';
                            bot.sendMessage(chatId, `❌ Gagal mendeploy worker: ${errorMessage}`, {
                                reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali ke menu Worker', callback_data: 'worker_menu_loggedin' }]] }
                            });
                        } finally {
                            fs.rmSync(localRepoPath, { recursive: true, force: true });
                            const preservedState = { apiToken: state.apiToken, accountId: state.accountId };
                            userState[chatId] = { ...preservedState, step: 'worker_menu' };
                        }
                    });
                    break;
            }
        } catch (error) {
            const errorMessage = error.response?.data?.errors?.[0]?.message || 'Terjadi kesalahan tidak diketahui.';
            bot.sendMessage(chatId, `❌ Terjadi kesalahan: ${errorMessage}`, {
                reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali ke Menu Utama', callback_data: 'main_menu' }]] }
            });
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
            bot.sendMessage(chatId, 'Untuk mengakses fitur Worker, silakan masukkan API Token khusus Worker Anda:');
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
                userState[chatId] = { ...state, step: 'worker_deploy_name' };
                bot.sendMessage(chatId, "Masukkan nama Worker Anda (hanya huruf kecil, angka, dan tanda dash `-`. Tidak boleh ada spasi atau simbol lain):");
                break;

            case 'worker_list':
                ensureLogin('worker_list_loggedin');
                break;
            case 'worker_list_loggedin':
                const res = await axios.get(`${CLOUDFLARE_API_BASE_URL}/accounts/${state.accountId}/workers/scripts`, {
                    headers: getCfHeaders(state.apiToken)
                });
                const workers = res.data.result;

                let listText = `\
━━━━━━━━━━━━━━━━━━
👷 *Daftar Worker Anda*
\n`;

                if (workers.length === 0) {
                    listText += 'Tidak ada worker yang ditemukan.';
                } else {
                    const subdomainRes = await axios.get(`${CLOUDFLARE_API_BASE_URL}/accounts/${state.accountId}/workers/subdomain`, { headers: getCfHeaders(state.apiToken) });
                    const subdomain = subdomainRes.data.result.subdomain;

                    workers.forEach((worker, index) => {
                        const workerUrl = `https://${worker.id}.${subdomain}.workers.dev`;
                        listText += `${index + 1}. *${worker.id}*\n   - URL: ${workerUrl}\n`;
                    });
                }
                listText += '━━━━━━━━━━━━━━━━━━';

                bot.sendMessage(chatId, listText, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali ke menu Worker', callback_data: 'worker_menu_loggedin' }]] }
                });
                break;
        }
    } catch (error) {
        const errorMessage = error.response?.data?.errors?.[0]?.message || 'Terjadi kesalahan tidak diketahui.';
        bot.sendMessage(chatId, `❌ Terjadi kesalahan: ${errorMessage}. Kembali ke menu utama.`, {
             reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali ke Menu Utama', callback_data: 'main_menu' }]] }
        });
        delete userState[chatId];
    }
};
