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
    // ... (kode tetap sama)
};

// --- Fungsi Menu ---
const sendWorkerMenu = (bot, chatId, accountIdentifier) => {
    // ... (kode tetap sama)
};

const sendWorkerDeletionList = async (bot, chatId, state) => {
    try {
        bot.sendMessage(chatId, '⏳ Sedang mengambil daftar worker...');
        const res = await axios.get(`${CLOUDFLARE_API_BASE_URL}/accounts/${state.accountId}/workers/scripts`, { headers: getCfHeaders(state.apiToken) });
        const workers = res.data.result;
        if (workers.length === 0) {
            bot.sendMessage(chatId, 'Tidak ada worker untuk dihapus.');
            sendWorkerMenu(bot, chatId, `ID ${state.accountId}`);
            return;
        }
        const keyboard = workers.map(w => ([{ text: w.id, callback_data: `worker_delete_confirm_${w.id}` }]));
        keyboard.push([{ text: '🔙 Batal', callback_data: 'worker_menu_loggedin' }]);
        bot.sendMessage(chatId, 'Pilih worker yang ingin dihapus:', { reply_markup: { inline_keyboard: keyboard } });
    } catch (error) {
        bot.sendMessage(chatId, `❌ Gagal mengambil daftar worker: ${error.message}`);
        sendWorkerMenu(bot, chatId, `ID ${state.accountId}`);
    }
};


// --- Logika Utama Handler ---
module.exports = (bot, userState) => {
    // ... (message handler tetap sama)
};

// --- Handler untuk Callback Query ---
module.exports.handleCallback = async (bot, userState, callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const chatId = msg.chat.id;

    // JAWAB QUERY SECEPATNYA
    bot.answerCallbackQuery(callbackQuery.id).catch(console.error);

    const state = userState[chatId] || {};

    const ensureLogin = (nextCallback) => {
        if (state.apiToken && state.accountId) {
            module.exports.handleCallback(bot, userState, { ...callbackQuery, data: nextCallback });
        } else {
            userState[chatId] = { ...(userState[chatId] || {}), step: 'awaiting_worker_token', nextCallback };
            bot.sendMessage(chatId, 'Untuk melanjutkan, silakan masukkan API Token Cloudflare Anda:');
        }
    };

    try {
        if (data.startsWith('worker_delete_confirm_')) {
            const workerName = data.replace('worker_delete_confirm_', '');
            bot.editMessageText(`Yakin ingin menghapus worker \`${workerName}\`?`, {
                chat_id: chatId, message_id: msg.message_id, parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Ya, Hapus', callback_data: `worker_delete_execute_${workerName}` }],
                        [{ text: '❌ Batal', callback_data: 'worker_menu_loggedin' }]
                    ]
                }
            });
            return;
        }

        if (data.startsWith('worker_delete_execute_')) {
            const workerName = data.replace('worker_delete_execute_', '');
            bot.editMessageText(`Menghapus worker \`${workerName}\`...`, { chat_id: chatId, message_id: msg.message_id, parse_mode: 'Markdown' });
            const command = `CLOUDFLARE_API_TOKEN=${state.apiToken} wrangler delete ${workerName} --account-id ${state.accountId}`;
            exec(command, (err, stdout, stderr) => {
                if (err) {
                    bot.sendMessage(chatId, `❌ Gagal menghapus worker:\n\`\`\`\n${stderr}\n\`\`\``, { parse_mode: 'Markdown' });
                } else {
                    bot.sendMessage(chatId, `✅ Worker \`${workerName}\` berhasil dihapus.\n\`\`\`\n${stdout}\n\`\`\``, { parse_mode: 'Markdown' });
                }
                sendWorkerMenu(bot, chatId, `ID ${state.accountId}`);
            });
            return;
        }

        switch (data) {
            case 'worker_menu': ensureLogin('worker_menu_loggedin'); break;
            case 'worker_menu_loggedin': sendWorkerMenu(bot, chatId, `ID ${state.accountId}`); break;

            case 'worker_deploy_github': ensureLogin('worker_deploy_github_loggedin'); break;
            case 'worker_deploy_github_loggedin':
                if (!checkAndInstallWrangler(bot, chatId)) {
                    sendStartMessage(bot, chatId);
                    return;
                }
                userState[chatId] = { ...state, step: 'worker_deploy_name' };
                bot.sendMessage(chatId, "Masukkan nama Worker Anda:");
                break;

            case 'worker_list': ensureLogin('worker_list_loggedin'); break;
            case 'worker_list_loggedin':
                bot.sendMessage(chatId, '⏳ Sedang mengambil daftar worker...');
                try {
                    const res = await axios.get(`${CLOUDFLARE_API_BASE_URL}/accounts/${state.accountId}/workers/scripts`, { headers: getCfHeaders(state.apiToken) });
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
                } catch (error) {
                     bot.sendMessage(chatId, `❌ Gagal mengambil daftar worker: ${error.message}`);
                }
                break;

            case 'worker_delete': ensureLogin('worker_delete_loggedin'); break;
            case 'worker_delete_loggedin':
                sendWorkerDeletionList(bot, chatId, state);
                break;
        }
    } catch (error) {
        const errorMessage = error.response?.data?.errors?.[0]?.message || error.message || 'Terjadi kesalahan.';
        bot.sendMessage(chatId, `❌ Terjadi kesalahan: ${errorMessage}`);
    }
};
