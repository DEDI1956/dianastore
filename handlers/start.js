const sendStartMessage = (bot, chatId) => {
    const text = `\
━━━━━━━━━━━━━━━━━━
🤖 *Selamat Datang!*
Pilih fitur:
📡 DNS
⚙️ Deploy Worker
━━━━━━━━━━━━━━━━━━`;

    const options = {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '📡 DNS', callback_data: 'dns_menu' }, { text: '⚙️ Deploy Worker', callback_data: 'worker_menu' }],
                [{ text: '🚪 Logout', callback_data: 'logout' }]
            ]
        }
    };

    bot.sendMessage(chatId, text, options);
};

const register = (bot, userState, logger) => {
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        logger.info(`User ${chatId} started the bot.`);
        // Hapus state lama saat /start dipanggil
        if(userState[chatId]) {
            delete userState[chatId];
        }
        sendStartMessage(bot, chatId);
    });
};

const handle = (bot, userState, callbackQuery, logger) => {
    const chatId = callbackQuery.message.chat.id;
    bot.answerCallbackQuery(callbackQuery.id).catch(err => logger.error(`answerCallbackQuery failed: ${err.stack}`));
    sendStartMessage(bot, chatId);
};

module.exports = {
    register,
    handle,
    sendStartMessage
};
