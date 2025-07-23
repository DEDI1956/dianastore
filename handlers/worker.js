const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// --- Fungsi Helper & Menu (tetap sama) ---
const getCfHeaders = (apiToken) => ({ 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' });
const isValidWorkerName = (name) => /^[a-z0-9-]+$/.test(name);
// ... (sendWorkerMenu, checkAndInstallWrangler, dll)

// --- Logika Utama Handler ---
module.exports = (bot, userState, logger) => {
    const CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';

    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text.trim();

        if (!userState[chatId] || !userState[chatId].step) {
            if(text.startsWith('/')) return;
            logger.warn(`No state for chatId ${chatId}, but message received: "${text}"`);
            return;
        }

        const state = userState[chatId];
        logger.info(`ChatId ${chatId}: step=${state.step}, input="${text}"`);

        try {
            switch (state.step) {
                // --- Alur Login Global ---
                case 'awaiting_worker_token':
                case 'awaiting_dns_token': // Menyatukan logika login
                    state.apiToken = text;
                    state.step = state.step.includes('dns') ? 'awaiting_dns_account_id' : 'awaiting_worker_account_id';
                    bot.sendMessage(chatId, 'API Token diterima. Sekarang masukkan Account ID Cloudflare Anda:');
                    break;
                case 'awaiting_worker_account_id':
                case 'awaiting_dns_account_id':
                    state.accountId = text;
                    const isDns = state.step.includes('dns');
                    if(isDns) {
                        state.step = 'awaiting_dns_zone_id';
                        bot.sendMessage(chatId, 'Account ID diterima. Sekarang masukkan Zone ID:');
                        return;
                    }
                    // Jika worker, validasi dan lanjutkan
                    bot.sendMessage(chatId, 'Memvalidasi kredensial...');
                    await axios.get(`${CLOUDFLARE_API_BASE_URL}/accounts/${state.accountId}/workers/scripts`, { headers: getCfHeaders(state.apiToken) });
                    bot.sendMessage(chatId, `✅ Login Worker berhasil untuk Akun ID: ${state.accountId}`);
                    const nextCallback = state.nextCallback;
                    delete state.step;
                    if (nextCallback) {
                        delete state.nextCallback;
                        module.exports.handleCallback(bot, userState, { message: msg, data: nextCallback, from: { id: chatId } }, logger);
                    } else {
                        sendWorkerMenu(bot, chatId, `ID ${state.accountId}`);
                    }
                    break;

                // --- Alur Deploy ---
                case 'worker_deploy_repo':
                    // ...
                    exec(deployCommand, (deployError, stdout, stderr) => {
                        // ...
                        fs.rmSync(newLocalRepoPath, { recursive: true, force: true });
                        delete state.step; // <-- PENTING
                        delete state.repoUrl; // <-- PENTING
                        delete state.workerName; // <-- PENTING
                        sendWorkerMenu(bot, chatId, `ID ${state.accountId}`);
                    });
                    break;
            }
        } catch (error) {
            logger.error(`Error in Worker message handler: ${error.stack}`);
            delete userState[chatId];
            bot.sendMessage(chatId, `❌ Terjadi kesalahan: ${error.message}. Sesi direset.`);
        }
    });
};

// --- Handler untuk Callback Query ---
module.exports.handleCallback = async (bot, userState, callbackQuery, logger) => {
    const { message: msg, data, from: { id: chatId } } = callbackQuery;
    bot.answerCallbackQuery(callbackQuery.id).catch(err => logger.error(`AnswerCallbackQuery failed: ${err.stack}`));

    const state = userState[chatId] || {};

    const ensureLogin = (nextCallback, type = 'worker') => {
        if (state.apiToken && state.accountId) {
             // Jika login untuk DNS tapi zoneId belum ada
            if (type === 'dns' && !state.zoneId) {
                 userState[chatId] = { ...state, step: 'awaiting_dns_zone_id', nextCallback };
                 bot.sendMessage(chatId, 'Untuk melanjutkan, silakan masukkan Zone ID Anda:');
                 return;
            }
            // Langsung jalankan jika sudah login
            module.exports.handleCallback(bot, userState, { ...callbackQuery, data: nextCallback }, logger);
        } else {
            // Mulai alur login dari awal
            userState[chatId] = { step: `awaiting_${type}_token`, nextCallback };
            bot.sendMessage(chatId, `Untuk melanjutkan, silakan masukkan API Token Cloudflare (${type.toUpperCase()}) Anda:`);
        }
    };

    try {
        if (data.startsWith('worker_delete_execute_')) {
            const workerName = data.replace('worker_delete_execute_', '');
            bot.editMessageText(`Menghapus worker \`${workerName}\`...`, { chat_id: chatId, message_id: msg.message_id, parse_mode: 'Markdown' });
            const command = `CLOUDFLARE_API_TOKEN=${state.apiToken} wrangler delete ${workerName} --account-id ${state.accountId}`;
            exec(command, (err, stdout, stderr) => {
                if (err) {
                    logger.error(`Failed to delete worker ${workerName}: ${stderr}`);
                    bot.sendMessage(chatId, `❌ Gagal menghapus worker:\n\`\`\`\n${stderr}\n\`\`\``, { parse_mode: 'Markdown' });
                } else {
                    logger.info(`Worker ${workerName} deleted successfully.`);
                    bot.sendMessage(chatId, `✅ Worker \`${workerName}\` berhasil dihapus.`, { parse_mode: 'Markdown' });
                }
                sendWorkerMenu(bot, chatId, `ID ${state.accountId}`);
            });
            return;
        }

        // ... (sisa switch case)

    } catch (error) {
        logger.error(`Error in Worker callback handler: ${error.stack}`);
        bot.sendMessage(chatId, `❌ Terjadi kesalahan: ${error.message}`);
        sendWorkerMenu(bot, chatId, `ID ${state.accountId}`);
    }
};
