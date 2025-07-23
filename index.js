require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');

// --- Konfigurasi Dasar ---
const token = process.env.TELEGRAM_TOKEN || config.telegramToken;
const botMode = process.env.BOT_MODE || 'polling'; // 'polling' atau 'webhook'
const webhookUrl = process.env.WEBHOOK_URL; // e.g., https://yourdomain.com/bot

// Pastikan direktori temp untuk clone repo ada
const tempDir = path.join(__dirname, 'temp_workers');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
}

// --- Inisialisasi Bot ---
let bot;
if (botMode === 'webhook') {
    if (!webhookUrl) {
        logger.error("WEBHOOK_URL tidak diatur di environment variables untuk mode webhook.");
        process.exit(1);
    }
    bot = new TelegramBot(token);
    bot.setWebHook(`${webhookUrl}/${token}`);
    logger.info('Bot berjalan dalam mode WEBHOOK.');
} else {
    bot = new TelegramBot(token, { polling: true });
    logger.info('Bot berjalan dalam mode POLLING.');
}

// --- State & Handlers ---
const userState = {};
const handlers = {};
const handlersPath = path.join(__dirname, 'handlers');

fs.readdirSync(handlersPath).forEach(file => {
    if (file.endsWith('.js')) {
        try {
            const handlerName = path.basename(file, '.js');
            handlers[handlerName] = require(path.join(handlersPath, file));
            handlers[handlerName].register(bot, userState, logger);
            logger.info(`Handler '${handlerName}' berhasil dimuat.`);
        } catch (error) {
            logger.error(`Gagal memuat handler ${file}: ${error.stack}`);
        }
    }
});

// --- Router Callback Query Utama ---
bot.on('callback_query', (callbackQuery) => {
    const { data, message } = callbackQuery;
    const chatId = message.chat.id;
    logger.info(`[Callback] ChatID: ${chatId}, Data: ${data}`);

    // Bersihkan state langkah (step) saat kembali ke menu, tapi pertahankan kredensial.
    if (data === 'main_menu' || data === 'dns_menu' || data === 'worker_menu') {
        if (userState[chatId]) {
            const { apiToken, accountId, zoneId } = userState[chatId];
            userState[chatId] = { apiToken, accountId, zoneId }; // Reset ke kredensial dasar
        }
    }

    const [handlerName, ...args] = data.split('_');

    if (handlers[handlerName] && typeof handlers[handlerName].handle === 'function') {
        handlers[handlerName].handle(bot, userState, callbackQuery, logger);
    } else if (handlerName === 'logout') {
        delete userState[chatId];
        bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Kamu berhasil logout.' });
        bot.editMessageText('Anda telah logout. Ketik /start untuk memulai lagi.', {
            chat_id: chatId,
            message_id: message.message_id,
            reply_markup: null
        });
        logger.info(`User ${chatId} logged out.`);
    } else if (handlerName === 'main') { // untuk 'main_menu'
         handlers['start'].handle(bot, userState, callbackQuery, logger);
    } else {
        logger.warn(`No handler found for callback prefix: ${handlerName}`);
        bot.answerCallbackQuery(callbackQuery.id, { text: 'Perintah tidak dikenali.', show_alert: true });
    }
});

logger.info(`Bot Telegram Cloudflare siap.`);

// Ekspor bot untuk webhook
module.exports = bot;
