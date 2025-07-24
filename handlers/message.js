// Handler ini tidak diekspor seperti yang lain, tapi logikanya akan diintegrasikan ke index.js
// atau dipanggil dari sana untuk menjaga satu 'on message' listener.

const handleTextMessage = (bot, userState, logger, msg) => {
    const chatId = msg.chat.id;
    const text = msg.text.trim();
    const state = userState[chatId];

    if (!state || !state.step) {
        // Mungkin bisa balas dengan pesan bantuan jika pengguna mengetik tanpa konteks
        return;
    }

    logger.info(`[Message] ChatID: ${chatId}, Step: ${state.step}, Input: ${text}`);

    const [handlerPrefix, ...stepParts] = state.step.split('_');

    try {
        // Logika routing berdasarkan prefix step
        if (handlerPrefix === 'auth') {
            const authHandler = require('./auth');
            authHandler.handleMessage(bot, userState, msg, logger);
        } else if (handlerPrefix === 'dns') {
            const dnsHandler = require('./dns');
            dnsHandler.handleMessage(bot, userState, msg, logger);
        } else if (handlerPrefix === 'worker') {
            const workerHandler = require('./worker');
            workerHandler.handleMessage(bot, userState, msg, logger);
        } else {
            logger.warn(`No message handler found for step prefix: ${handlerPrefix}`);
        }
    } catch (error) {
        logger.error(`[Message Handler] Error processing step ${state.step} for chat ${chatId}: ${error.stack}`);
        bot.sendMessage(chatId, `❌ Terjadi kesalahan saat memproses input Anda. Silakan coba lagi.`);
        delete userState[chatId].step; // Hapus step yang error
    }
};

module.exports = { handleTextMessage };
