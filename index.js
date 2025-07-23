require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');

const token = process.env.TELEGRAM_TOKEN || config.telegramToken;
const bot = new TelegramBot(token, { polling: true });

logger.info('Bot berjalan dalam mode POLLING.');

const userState = {};
const handlers = {};
const handlersPath = path.join(__dirname, 'handlers');

fs.readdirSync(handlersPath).forEach(file => {
    if (file.endsWith('.js')) {
        try {
            const handlerName = path.basename(file, '.js');
            const handlerModule = require(path.join(handlersPath, file));
            if (typeof handlerModule.register === 'function') {
                handlerModule.register(bot, userState, logger);
            }
            handlers[handlerName] = handlerModule;
            logger.info(`Handler '${handlerName}' berhasil dimuat.`);
        } catch (error) {
            logger.error(`Gagal memuat handler ${file}: ${error.stack}`);
        }
    }
});

// Router Callback Query Utama
bot.on('callback_query', (callbackQuery) => {
    try {
        const { data, message } = callbackQuery;
        const chatId = message.chat.id;
        logger.info(`[Callback] ChatID: ${chatId}, Data: ${data}`);

        const handlerName = data.split('_')[0];

        if (handlers[handlerName] && typeof handlers[handlerName].handle === 'function') {
            handlers[handlerName].handle(bot, userState, callbackQuery, logger);
        } else if (data === 'logout') {
            delete userState[chatId];
            bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Kamu berhasil logout.' });
            bot.editMessageText('Anda telah logout. Ketik /start untuk memulai lagi.', {
                chat_id: chatId,
                message_id: message.message_id,
                reply_markup: null
            });
            logger.info(`User ${chatId} logged out.`);
        } else if (data === 'main_menu') {
            handlers['start'].handle(bot, userState, callbackQuery, logger);
        } else {
            logger.warn(`No handler found for callback prefix: ${handlerName}`);
            bot.answerCallbackQuery(callbackQuery.id, { text: 'Perintah tidak dikenali.', show_alert: true });
        }
    } catch (error) {
        logger.error(`[FATAL] Uncaught error in callback_query listener: ${error.stack}`);
        const chatId = callbackQuery.message.chat.id;
        bot.sendMessage(chatId, '🤖 Terjadi kesalahan fatal. Saya telah memberi tahu pengembang saya. Silakan coba lagi nanti.');
    }
});

logger.info('Bot Telegram Cloudflare siap.');
