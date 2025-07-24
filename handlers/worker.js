// ... (kode helper di atas tetap sama) ...

const sendWorkerMenu = (bot, chatId) => {
    // ... (kode sendWorkerMenu tetap sama)
};

// ... (register function tetap sama) ...

const handle = async (bot, userState, callbackQuery, logger) => {
    const { data, message } = callbackQuery;
    const chatId = message.chat.id;

    bot.answerCallbackQuery(callbackQuery.id).catch(err => logger.error(`[Worker] answerCallbackQuery failed: ${err.stack}`));

    const state = userState[chatId] || {};
    logger.info(`[Worker Handle] ChatID: ${chatId}, Data: ${data}, State: ${JSON.stringify(state)}`);

    // --- Ensure Login ---
    if (!state.apiToken || !state.accountId) {
        logger.info(`[Worker] Unauthenticated user ${chatId} for ${data}. Starting login flow.`);
        userState[chatId] = { ...state, step: 'worker_await_token', nextCallback: callbackQuery };
        bot.sendMessage(chatId, 'Anda perlu login untuk fitur Worker. Silakan masukkan API Token Cloudflare Anda:');
        return;
    }

    try {
        if (data.startsWith('worker_set_entry_')) {
            // ... (logika set entry point tetap sama) ...
            return;
        }

        if (data.startsWith('worker_delete_confirm_')) {
            // ... (logika konfirmasi hapus tetap sama) ...
            return;
        }

        if (data.startsWith('worker_delete_execute_')) {
            // ... (logika eksekusi hapus tetap sama) ...
            return;
        }

        switch (data) {
            case 'worker_menu':
                sendWorkerMenu(bot, chatId);
                break;
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
            default:
                 logger.warn(`Unhandled worker callback: ${data}`);
                 bot.sendMessage(chatId, 'Perintah worker tidak dikenali.');
                 break;
        }
    } catch (error) {
        logger.error(`[Worker Handle] Error for ${chatId}: ${error.stack}`);
        bot.sendMessage(chatId, `❌ Terjadi kesalahan pada fitur Worker: ${error.message}`);
    }
};

// ... (deployWorker dan export tetap sama) ...
module.exports = { register, handle };
