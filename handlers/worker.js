const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { sendStartMessage } = require('./start');

const CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';

// --- Fungsi Helper ---
const getCfHeaders = (apiToken) => ({
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/javascript'
});

// --- Fungsi Menu ---
const sendWorkerMenu = (bot, chatId, accountEmail) => {
    const text = `\
━━━━━━━━━━━━━━━━━━
✅ *Login Worker Berhasil*

👤 Akun: ${accountEmail}

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

                    const response = await axios.get(`${CLOUDFLARE_API_BASE_URL}/accounts/${state.accountId}/workers/scripts`, {
                        headers: { 'Authorization': `Bearer ${state.apiToken}` }
                    });

                    // Asumsi berhasil jika tidak ada error, Cloudflare API tidak mengembalikan email di endpoint ini.
                    // Kita akan gunakan Account ID untuk tampilan.
                    const accountIdentifier = state.accountId;

                    bot.sendMessage(chatId, `✅ Login Worker berhasil untuk Akun ID: ${accountIdentifier}`);
                    state.step = 'worker_menu';
                    sendWorkerMenu(bot, chatId, `ID ${accountIdentifier}`); // Menggunakan ID karena email tidak tersedia
                    break;

                // --- Alur Deploy ---
                case 'worker_deploy_repo':
                    const repoUrl = text;
                    const repoName = path.basename(repoUrl, '.git');
                    const localRepoPath = path.join(__dirname, '..', 'temp_workers', repoName);

                    bot.sendMessage(chatId, `Mencoba meng-clone repository dari ${repoUrl}...`);

                    exec(`git clone ${repoUrl} ${localRepoPath}`, async (error, stdout, stderr) => {
                        if (error) {
                            bot.sendMessage(chatId, `❌ Gagal meng-clone repository: ${stderr}`);
                            delete userState[chatId];
                            return;
                        }

                        bot.sendMessage(chatId, '✅ Repository berhasil di-clone.');

                        // Cari file .js utama (misal: index.js, worker.js)
                        const files = fs.readdirSync(localRepoPath);
                        const jsFile = files.find(f => f.endsWith('.js') && (f === 'index.js' || f === 'worker.js'));

                        if (!jsFile) {
                            bot.sendMessage(chatId, '❌ Tidak dapat menemukan file worker utama (index.js atau worker.js).');
                            delete userState[chatId];
                            return;
                        }

                        const scriptContent = fs.readFileSync(path.join(localRepoPath, jsFile), 'utf-8');
                        const workerName = repoName; // Gunakan nama repo sebagai nama worker

                        try {
                            await axios.put(
                                `${CLOUDFLARE_API_BASE_URL}/accounts/${state.accountId}/workers/scripts/${workerName}`,
                                scriptContent,
                                { headers: getCfHeaders(state.apiToken) }
                            );

                            const workerUrl = `https://${workerName}.${(await axios.get(`${CLOUDFLARE_API_BASE_URL}/accounts/${state.accountId}/workers/subdomain`, { headers: { 'Authorization': `Bearer ${state.apiToken}` } })).data.result.subdomain}.workers.dev`;

                            const successText = `\
━━━━━━━━━━━━━━━━━━
✅ *Worker Berhasil Dideploy*

👷 Worker: \`${workerName}\`
🔗 URL: ${workerUrl}
━━━━━━━━━━━━━━━━━━`;
                            bot.sendMessage(chatId, successText, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali ke Fitur Worker', callback_data: 'worker_menu_loggedin' }]] } });

                        } catch(deployError) {
                             bot.sendMessage(chatId, `❌ Gagal mendeploy worker: ${deployError.response.data.errors[0].message}`);
                        } finally {
                            // Hapus repo lokal
                            fs.rmdirSync(localRepoPath, { recursive: true });
                            const preservedState = { apiToken: state.apiToken, accountId: state.accountId };
                            userState[chatId] = { ...preservedState, step: 'worker_menu' };
                        }
                    });
                    break;
            }
        } catch (error) {
            console.error(error);
            bot.sendMessage(chatId, '❌ Terjadi kesalahan. Pastikan kredensial dan input Anda benar.');
            delete userState[chatId];
            sendStartMessage(bot, chatId);
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
        switch(data) {
            case 'worker_menu':
                ensureLogin('worker_menu_loggedin');
                break;
            case 'worker_menu_loggedin':
                 // Perlu mengambil ulang info akun karena bisa jadi sesi baru
                 sendWorkerMenu(bot, chatId, `ID ${state.accountId}`);
                 break;

            case 'worker_deploy_github':
                ensureLogin('worker_deploy_github_loggedin');
                break;
            case 'worker_deploy_github_loggedin':
                userState[chatId] = { ...state, step: 'worker_deploy_repo' };
                bot.sendMessage(chatId, 'Masukkan link repository GitHub untuk worker yang ingin Anda deploy:');
                break;

            case 'worker_list':
                ensureLogin('worker_list_loggedin');
                break;
            case 'worker_list_loggedin':
                const res = await axios.get(`${CLOUDFLARE_API_BASE_URL}/accounts/${state.accountId}/workers/scripts`, {
                    headers: { 'Authorization': `Bearer ${state.apiToken}` }
                });
                const workers = res.data.result;

                let listText = `\
━━━━━━━━━━━━━━━━━━
👷 *Daftar Worker Anda*
\n`;

                if (workers.length === 0) {
                    listText += 'Tidak ada worker yang ditemukan.';
                } else {
                    // Ambil subdomain untuk membangun URL
                    const subdomainRes = await axios.get(`${CLOUDFLARE_API_BASE_URL}/accounts/${state.accountId}/workers/subdomain`, { headers: { 'Authorization': `Bearer ${state.apiToken}` } });
                    const subdomain = subdomainRes.data.result.subdomain;

                    workers.forEach((worker, index) => {
                        const workerUrl = `https://${worker.id}.${subdomain}.workers.dev`;
                        listText += `${index + 1}. *${worker.id}*\n   - URL: ${workerUrl}\n`;
                    });
                }
                listText += '━━━━━━━━━━━━━━━━━━';

                bot.sendMessage(chatId, listText, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali ke Fitur Worker', callback_data: 'worker_menu_loggedin' }]] } });
                break;
        }
    } catch (error) {
        console.error(error.response ? error.response.data : error.message);
        bot.sendMessage(chatId, '❌ Terjadi kesalahan. Kembali ke menu utama.');
        delete userState[chatId];
        sendStartMessage(bot, chatId);
    }
};
