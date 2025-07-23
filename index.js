require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger'); // Akan dibuat nanti

// Pastikan direktori temp untuk clone repo ada
const tempDir = path.join(__dirname, 'temp_workers');
if (!fs.existsSync(tempDir)){
    fs.mkdirSync(tempDir);
}

const bot = new TelegramBot(config.telegramToken, { polling: true });

// Objek untuk menyimpan state pengguna
const userState = {};

// Memuat semua handler dari folder handlers
const handlersPath = path.join(__dirname, 'handlers');
fs.readdirSync(handlersPath).forEach(file => {
    if (file.endsWith('.js')) {
        try {
            const handler = require(path.join(handlersPath, file));
            if (typeof handler === 'function') {
                handler(bot, userState, logger); // Inject logger
            }
        } catch (error) {
            logger.error(`Gagal memuat handler ${file}: ${error.stack}`);
        }
    }
});

// Handler utama untuk callback query
bot.on('callback_query', (callbackQuery) => {
    const data = callbackQuery.data;
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;

    // Bersihkan state langkah (step) saat kembali ke menu utama,
    // tapi pertahankan kredensial.
    if (data === 'main_menu' || data === 'dns_menu_loggedin' || data === 'worker_menu_loggedin') {
        if (userState[chatId]) {
            const { apiToken, accountId, zoneId } = userState[chatId];
            userState[chatId] = { apiToken, accountId, zoneId }; // Reset ke kredensial dasar
        }
    }

    // Route callback data ke handler yang sesuai
    if (data.startsWith('dns_')) {
        const dnsHandler = require('./handlers/dns');
        dnsHandler.handleCallback(bot, userState, callbackQuery, logger);
    } else if (data.startsWith('worker_')) {
        const workerHandler = require('./handlers/worker');
        workerHandler.handleCallback(bot, userState, callbackQuery, logger);
    } else if (data === 'main_menu') {
        const startHandler = require('./handlers/start');
        startHandler.sendStartMessage(bot, chatId);
    } else if (data === 'logout') {
        delete userState[chatId];
        bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Kamu berhasil logout.' });
        bot.editMessageText('Anda telah logout. Ketik /start untuk memulai lagi.', {
            chat_id: chatId,
            message_id: msg.message_id,
            reply_markup: null
        });
        logger.info(`User ${chatId} logged out.`);
    }
});

console.log('Bot Telegram Cloudflare sedang berjalan...');
logger.info('Bot started successfully.');
