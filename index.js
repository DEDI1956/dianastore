require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');

const token = process.env.TELEGRAM_TOKEN || config.telegramToken;
const bot = new TelegramBot(token, { polling: { interval: 1000, params: { timeout: 10 } } });

bot.on('polling_error', (error) => {
    logger.error(`[Polling Error] ${error.code} - ${error.message}`);
});

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

bot.on('callback_query', (callbackQuery) => {
    try {
        const { data, message } = callbackQuery;
        const chatId = message.chat.id;
        logger.info(`[Callback] ChatID: ${chatId}, Data: ${data}`);

        const handlerPrefix = data.split('_')[0];

        if (handlers[handlerPrefix] && typeof handlers[handlerPrefix].handle === 'function') {
            handlers[handlerPrefix].handle(bot, userState, callbackQuery, logger);
        } else if (data === 'main_menu') {
            handlers['start'].handle(bot, userState, callbackQuery, logger);
        } else if (data === 'logout') {
            delete userState[chatId];
            bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Kamu berhasil logout.' });
            bot.editMessageText('Anda telah logout. Ketik /start untuk memulai lagi.', {
                chat_id: chatId, message_id: message.message_id, reply_markup: null
            });
            logger.info(`User ${chatId} logged out.`);
        } else {
            logger.warn(`No handler found for callback prefix: ${handlerPrefix}`);
            bot.answerCallbackQuery(callbackQuery.id, { text: 'Perintah tidak dikenali.', show_alert: true });
        }
    } catch (error) {
        logger.error(`[FATAL] Uncaught error in callback_query listener: ${error.stack}`);
        if(callbackQuery.message) {
             bot.sendMessage(callbackQuery.message.chat.id, '🤖 Terjadi kesalahan fatal. Silakan coba lagi nanti.');
        }
    }
});

logger.info('Bot Telegram Cloudflare siap.');
