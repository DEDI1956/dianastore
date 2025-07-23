const sendStartMessage = (bot, chatId) => {
    const text = `\
━━━━━━━━━━━━━━━━━━
🤖 *Selamat Datang!*
Pilih fitur:
📡 DNS
⚙️ Deploy Worker
━━━━━━━━━━━━━━━━━━`;

    const options = {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '📡 DNS', callback_data: 'dns_menu' },
                    { text: '⚙️ Deploy Worker', callback_data: 'worker_menu' }
                ]
            ]
        }
    };

    bot.sendMessage(chatId, text, options);
};

module.exports = (bot) => {
    bot.onText(/\/start/, (msg) => {
        sendStartMessage(bot, msg.chat.id);
    });
};

module.exports.sendStartMessage = sendStartMessage;
