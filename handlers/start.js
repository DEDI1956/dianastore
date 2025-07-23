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
                ],
                [
                    { text: '🚪 Logout', callback_data: 'logout' }
                ]
            ]
        }
    };

    bot.sendMessage(chatId, text, options);
};

module.exports = (bot, userState) => {
    bot.onText(/\/start/, (msg) => {
        // Hapus state lama saat /start dipanggil
        if(userState[msg.chat.id]) {
            delete userState[msg.chat.id];
        }
        sendStartMessage(bot, msg.chat.id);
    });
};

module.exports.sendStartMessage = sendStartMessage;
