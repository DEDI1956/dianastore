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

const sendWorkerDeletionList = async (bot, chatId, state) => {
    try {
        const res = await axios.get(`${CLOUDFLARE_API_BASE_URL}/accounts/${state.accountId}/workers/scripts`, { headers: getCfHeaders(state.apiToken) });
        const workers = res.data.result;
        if (workers.length === 0) {
            bot.sendMessage(chatId, 'Tidak ada worker untuk dihapus.');
            return;
        }
        const keyboard = workers.map(w => ([{ text: w.id, callback_data: `worker_delete_confirm_${w.id}` }]));
        keyboard.push([{ text: '🔙 Batal', callback_data: 'worker_menu_loggedin' }]);
        bot.sendMessage(chatId, 'Pilih worker yang ingin dihapus:', { reply_markup: { inline_keyboard: keyboard } });
    } catch (error) {
        bot.sendMessage(chatId, `❌ Gagal mengambil daftar worker: ${error.message}`);
    }
};

// --- Logika Utama Handler ---
module.exports = (bot, userState) => {
    bot.on('message', async (msg) => {
        // ... (message handler yang ada tetap sama)
    });
};

// --- Handler untuk Callback Query ---
module.exports.handleCallback = async (bot, userState, callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const chatId = msg.chat.id;

    bot.answerCallbackQuery(callbackQuery.id).catch(console.error);
    const state = userState[chatId] || {};

    const ensureLogin = (nextCallback) => {
        if (state.apiToken && state.accountId) {
            module.exports.handleCallback(bot, userState, { ...callbackQuery, data: nextCallback });
        } else {
            userState[chatId] = { ...(userState[chatId] || {}), step: 'awaiting_worker_token', nextCallback };
            bot.sendMessage(chatId, 'Silakan masukkan API Token Cloudflare Anda:');
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
                // ... (logika list worker tetap sama)
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
