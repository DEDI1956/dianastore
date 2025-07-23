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

// Muat semua handler dan daftarkan message listener mereka
fs.readdirSync(handlersPath).forEach(file => {
    if (file.endsWith('.js')) {
        try {
            const handlerName = path.basename(file, '.js');
            const handlerModule = require(path.join(handlersPath, file));
            // Setiap handler sekarang bertanggung jawab atas 'on.message' nya sendiri
            if (typeof handlerModule.register === 'function') {
                handlerModule.register(bot, userState, logger);
            }
            // Simpan modul untuk dipanggil oleh callback handler
            handlers[handlerName] = handlerModule;
            logger.info(`Handler '${handlerName}' berhasil dimuat.`);
        } catch (error) {
            logger.error(`Gagal memuat handler ${file}: ${error.stack}`);
        }
    }
});

// Router Callback Query Utama
bot.on('callback_query', (callbackQuery) => {
    const { data, message } = callbackQuery;
    const chatId = message.chat.id;
    logger.info(`[Callback] ChatID: ${chatId}, Data: ${data}`);

    const handlerName = data.split('_')[0]; // e.g., 'dns' from 'dns_menu'

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
});

logger.info('Bot Telegram Cloudflare siap.');
