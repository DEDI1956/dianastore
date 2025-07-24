require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');
const { handleTextMessage } = require('./handlers/message');

const token = process.env.TELEGRAM_TOKEN || config.telegramToken;
const bot = new TelegramBot(token, { polling: { interval: 1000, params: { timeout: 10 } } });

bot.on('polling_error', (error) => {
    logger.error(`[Polling Error] ${error.code} - ${error.message}`);
});

logger.info('Bot berjalan dalam mode POLLING.');

const userState = {};
const handlers = {};
const handlersPath = path.join(__dirname, 'handlers');

// Muat semua modul handler
fs.readdirSync(handlersPath).forEach(file => {
    if (file.endsWith('.js') && file !== 'message.js') { // Jangan muat message handler sebagai callback handler
        try {
            const handlerName = path.basename(file, '.js');
            handlers[handlerName] = require(path.join(handlersPath, file));
            logger.info(`Handler module '${handlerName}' berhasil dimuat.`);
        } catch (error) {
            logger.error(`Gagal memuat handler ${file}: ${error.stack}`);
        }
    }
});

// --- Listener Tunggal ---
// Listener untuk /start
handlers['start'].register(bot, userState, logger);

// Listener untuk semua pesan teks lainnya
bot.on('message', (msg) => {
    // Abaikan command /start karena sudah ditangani
    if (msg.text && msg.text.startsWith('/start')) return;
    handleTextMessage(bot, userState, logger, msg);
});

// Listener untuk semua callback query
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
