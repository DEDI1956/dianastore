const sendStartMessage = (bot, chatId) => {
    // ... (kode sendStartMessage tetap sama)
};

const register = (bot, userState, logger) => {
    bot.onText(/\/start/, (msg) => {
        try {
            const chatId = msg.chat.id;
            logger.info(`User ${chatId} started the bot.`);
            if(userState[chatId]) {
                delete userState[chatId];
            }
            sendStartMessage(bot, chatId);
        } catch (error) {
            logger.error(`Error in /start handler: ${error.stack}`);
            bot.sendMessage(msg.chat.id, 'Terjadi kesalahan saat memulai bot. Silakan coba lagi.');
        }
    });
};

const handle = (bot, userState, callbackQuery, logger) => {
    try {
        const chatId = callbackQuery.message.chat.id;
        bot.answerCallbackQuery(callbackQuery.id).catch(err => logger.error(`answerCallbackQuery failed: ${err.stack}`));
        sendStartMessage(bot, chatId);
    } catch (error) {
        logger.error(`Error in start handle function: ${error.stack}`);
    }
};

module.exports = {
    register,
    handle,
    sendStartMessage
};
