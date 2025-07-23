const express = require('express');
const bodyParser = require('body-parser');
const bot = require('./index'); // Impor instance bot dari index.js
const logger = require('./utils/logger');

const token = process.env.TELEGRAM_TOKEN || require('./config').telegramToken;
const port = process.env.PORT || 3000;

const app = express();
app.use(bodyParser.json());

// Endpoint untuk webhook Telegram
app.post(`/bot/${token}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// Endpoint untuk health check
app.get('/', (req, res) => {
    res.send('Bot is running!');
});

app.listen(port, () => {
    logger.info(`Server webhook berjalan di port ${port}`);
});
