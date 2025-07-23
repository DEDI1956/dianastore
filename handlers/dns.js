const axios = require('axios');

const CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';

const getCfHeaders = (apiToken) => ({
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json'
});

const sendDnsMenu = (bot, chatId) => {
    // ... (kode sendDnsMenu tetap sama)
};

const register = (bot, userState, logger) => {
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        try {
            const text = msg.text.trim();
            const state = userState[chatId];

            if (!state || !state.step || !state.step.startsWith('awaiting_dns')) return;

            logger.info(`[DNS Auth] ChatID: ${chatId}, Step: ${state.step}`);

            if (state.step === 'awaiting_dns_token') {
                bot.sendMessage(chatId, 'Memverifikasi token...');
                const verifyResponse = await axios.get(`${CLOUDFLARE_API_BASE_URL}/user`, { headers: getCfHeaders(text) });

                state.apiToken = text;
                state.step = 'awaiting_dns_account_id';
                bot.sendMessage(chatId, `✅ Token valid untuk ${verifyResponse.data.result.email}!\nSekarang masukkan Account ID:`);
            } else if (state.step === 'awaiting_dns_account_id') {
                state.accountId = text;
                state.step = 'awaiting_dns_zone_id';
                bot.sendMessage(chatId, '✅ Account ID diterima.\nSekarang masukkan Zone ID:');
            } else if (state.step === 'awaiting_dns_zone_id') {
                state.zoneId = text;
                await axios.get(`${CLOUDFLARE_API_BASE_URL}/zones/${state.zoneId}`, { headers: getCfHeaders(state.apiToken) });

                bot.sendMessage(chatId, `✅ Login DNS berhasil!`);
                delete state.step;

                if (state.nextCallback) {
                    const originalCallback = state.nextCallback;
                    delete state.nextCallback;
                    handle(bot, userState, originalCallback, logger);
                } else {
                    sendDnsMenu(bot, chatId);
                }
            }
            // ... logika untuk step DNS lainnya ...
        } catch (error) {
            const errorMessage = error.response?.data?.errors?.[0]?.message || error.message;
            logger.error(`[DNS Auth] Error for ${chatId}: ${errorMessage}`);
            bot.sendMessage(chatId, `❌ Gagal: ${errorMessage}. Silakan coba lagi.`);
            // Jangan hapus state agar user bisa coba lagi input yang salah
        }
    });
};

const handle = async (bot, userState, callbackQuery, logger) => {
    const { data, message } = callbackQuery;
    const chatId = message.chat.id;

    bot.answerCallbackQuery(callbackQuery.id).catch(err => logger.error(`[DNS] answerCallbackQuery failed: ${err.stack}`));

    const state = userState[chatId] || {};

    if (!state.apiToken || !state.accountId || !state.zoneId) {
        logger.info(`[DNS] Unauthenticated user ${chatId} for ${data}.`);
        userState[chatId] = { ...state, step: 'awaiting_dns_token', nextCallback: callbackQuery };
        bot.sendMessage(chatId, 'Anda harus login untuk fitur DNS. Silakan masukkan API Token Cloudflare Anda:');
        return;
    }

    try {
        logger.info(`[DNS] Authenticated user ${chatId} accessing ${data}.`);

        switch (data) {
            case 'dns_menu':
                sendDnsMenu(bot, chatId);
                break;

            case 'dns_list_a':
            case 'dns_list_cname':
                const type = data.includes('_a') ? 'A' : 'CNAME';
                bot.sendMessage(chatId, `⏳ Mengambil daftar ${type} record...`);
                const response = await axios.get(`${CLOUDFLARE_API_BASE_URL}/zones/${state.zoneId}/dns_records?type=${type}`, { headers: getCfHeaders(state.apiToken) });
                const records = response.data.result;
                let listText = `📋 *Daftar ${type} Record*\n\n`;
                if (records.length === 0) listText += 'Tidak ada record ditemukan.';
                else records.forEach((r, i) => { listText += `${i + 1}. \`${r.name}\` → \`${r.content}\`\n`; });
                bot.sendMessage(chatId, listText, { parse_mode: 'Markdown' });
                break;

            default:
                bot.sendMessage(chatId, 'Fitur DNS ini belum diimplementasikan.');
                break;
        }
    } catch (error) {
        const errorMessage = error.response?.data?.errors?.[0]?.message || error.message;
        logger.error(`[DNS Handle] Error for ${chatId}: ${errorMessage}`);
        bot.sendMessage(chatId, `❌ Terjadi kesalahan pada fitur DNS: ${errorMessage}`);
    }
};

module.exports = {
    register,
    handle
};
