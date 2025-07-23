// ... (kode helper di atas tetap sama) ...

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

// ... (register function tetap sama) ...

const handle = async (bot, userState, callbackQuery, logger) => {
    const { data, message } = callbackQuery;
    const chatId = message.chat.id;

    // ... (logika answerCallbackQuery dan ensureLogin tetap sama) ...

    try {
        const state = userState[chatId] || {};

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
        // ... (error handling tetap sama) ...
    }
};

// ... (deployWorker dan export tetap sama) ...
module.exports = { register, handle };
