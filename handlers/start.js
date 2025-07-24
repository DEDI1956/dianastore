const sendStartMessage = (bot, chatId) => {
    const text = `\
━━━━━━━━━━━━━━━━━━
🤖 *Selamat Datang!*
Pilih fitur yang tersedia:
━━━━━━━━━━━━━━━━━━`;

    const options = {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '📡 Manajemen DNS', callback_data: 'dns_menu' }],
                [{ text: '⚙️ Manajemen Worker', callback_data: 'worker_menu' }],
                [{ text: '🚪 Logout', callback_data: 'logout' }]
            ]
        }
    };
    bot.sendMessage(chatId, text, options);
};

const register = (bot, userState, logger) => {
    bot.onText(/\/start/, (msg) => {
        try {
            const chatId = msg.chat.id;
            logger.info(`User ${chatId} issued /start command.`);
            if (userState[chatId]) {
                delete userState[chatId];
                logger.info(`State for user ${chatId} cleared.`);
            }
            sendStartMessage(bot, chatId);
        } catch (error) {
            logger.error(`Error in /start handler: ${error.stack}`);
        }
    });
};

const handle = (bot, userState, callbackQuery, logger) => {
    try {
        const chatId = callbackQuery.message.chat.id;
        bot.answerCallbackQuery(callbackQuery.id).catch(err => logger.error(`answerCallbackQuery failed: ${err.stack}`));
        sendStartMessage(bot, chatId);
    } catch (error) {
        logger.error(`Error in start.handle function: ${error.stack}`);
    }
};

module.exports = {
    register,
    handle,
    sendStartMessage
};
