const axios = require('axios');
const { ensureLoggedIn } = require('./auth');

const CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';

const getCfHeaders = (apiToken) => ({
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json'
});

const sendDnsMenu = (bot, chatId, logger) => {
    logger.info(`Sending DNS menu to ${chatId}`);
    const text = `\
━━━━━━━━━━━━━━━━━━
📡 *Menu DNS*
Pilih salah satu opsi:
━━━━━━━━━━━━━━━━━━`;
    const options = {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '1️⃣ Set A Record', callback_data: 'dns_set_a' }, { text: '2️⃣ Set CNAME', callback_data: 'dns_set_cname' }],
                [{ text: '3️⃣ List A Records', callback_data: 'dns_list_a' }, { text: '4️⃣ List CNAME', callback_data: 'dns_list_cname' }],
                [{ text: '5️⃣ 🗑️ Hapus A Record', callback_data: 'dns_delete_a' }, { text: '6️⃣ 🗑️ Hapus CNAME', callback_data: 'dns_delete_cname' }],
                [{ text: '🔙 Kembali', callback_data: 'main_menu' }, { text: '🚪 Logout', callback_data: 'logout' }]
            ]
        }
    };
    bot.sendMessage(chatId, text, options);
};

const register = (bot, userState, logger) => {
    // Message handler untuk input DNS (seperti subdomain, IP, dll.)
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text.trim();
        const state = userState[chatId];

        if (!state || !state.step || !state.step.startsWith('dns_')) return;

        logger.info(`[DNS] ChatID: ${chatId}, Step: ${state.step}, Input: ${text}`);

        // ... (Logika untuk menangani input DNS spesifik seperti subdomain, IP, dll.)
        // Contoh:
        if (state.step === 'dns_await_subdomain') {
            state.subdomain = text;
            state.step = 'dns_await_ip';
            bot.sendMessage(chatId, 'Masukkan IP Address:');
        }
    });
};

const handle = (bot, userState, callbackQuery, logger) => {
    const { data, message } = callbackQuery;
    const chatId = message.chat.id;

    const action = () => {
        // Fungsi ini akan dijalankan setelah login berhasil
        const state = userState[chatId];
        bot.answerCallbackQuery(callbackQuery.id).catch(err => logger.error(`answerCallbackQuery failed: ${err.stack}`));

        // Logika untuk setiap aksi DNS
        switch (data) {
            case 'dns_menu':
                sendDnsMenu(bot, chatId, logger);
                break;

            case 'dns_list_a':
            case 'dns_list_cname':
                const type = data.includes('_a') ? 'A' : 'CNAME';
                bot.sendMessage(chatId, `⏳ Mengambil daftar ${type} record...`);
                axios.get(`${CLOUDFLARE_API_BASE_URL}/zones/${state.zoneId}/dns_records?type=${type}`, { headers: getCfHeaders(state.apiToken) })
                    .then(response => {
                        const records = response.data.result;
                        let listText = `📋 *Daftar ${type} Record*\n\n`;
                        if (records.length === 0) listText += 'Tidak ada record ditemukan.';
                        else records.forEach((r, i) => { listText += `${i + 1}. \`${r.name}\` → \`${r.content}\`\n`; });
                        bot.sendMessage(chatId, listText, { parse_mode: 'Markdown' });
                    })
                    .catch(err => {
                        logger.error(`[DNS List] Error: ${err.stack}`);
                        bot.sendMessage(chatId, '❌ Gagal mengambil data.');
                    });
                break;

            // ... (Tambahkan case untuk set dan delete di sini)
        }
    };

    // Panggil ensureLoggedIn, berikan 'dns' sebagai izin yang dibutuhkan
    // dan fungsi 'action' sebagai apa yang harus dilakukan setelah login.
    ensureLoggedIn(bot, userState, chatId, 'dns', action);
};

module.exports = {
    register,
    handle
};
