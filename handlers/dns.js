const axios = require('axios');
const { ensureLoggedIn } = require('./auth');

const CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';
const getCfHeaders = (apiToken) => ({ 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' });

const sendDnsMenu = (bot, chatId) => {
    const text = `📡 *Menu DNS*\nPilih salah satu opsi:`;
    bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '1️⃣ Set A Record', callback_data: 'dns_set_a' }, { text: '2️⃣ Set CNAME', callback_data: 'dns_set_cname' }],
                [{ text: '3️⃣ List A Records', callback_data: 'dns_list_a' }, { text: '4️⃣ List CNAME', callback_data: 'dns_list_cname' }],
                [{ text: '5️⃣ 🗑️ Hapus A Record', callback_data: 'dns_delete_a' }, { text: '6️⃣ 🗑️ Hapus CNAME', callback_data: 'dns_delete_cname' }],
                [{ text: '🔙 Kembali', callback_data: 'main_menu' }, { text: '🚪 Logout', callback_data: 'logout' }]
            ]
        }
    });
};

const register = (bot, userState, logger) => {
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const state = userState[chatId];
        if (!state || !state.step || !state.step.startsWith('dns_')) return;

        try {
            const text = msg.text.trim();
            logger.info(`[DNS] ChatID: ${chatId}, Step: ${state.step}`);

            switch (state.step) {
                case 'dns_await_name':
                    state.recordName = text;
                    state.step = state.recordType === 'A' ? 'dns_await_content_ip' : 'dns_await_content_target';
                    bot.sendMessage(chatId, `✅ Nama record: \`${text}\`\nMasukkan konten (IP untuk A, Target untuk CNAME):`);
                    break;
                case 'dns_await_content_ip':
                case 'dns_await_content_target':
                    state.recordContent = text;
                    state.step = 'dns_await_proxy';
                    bot.sendMessage(chatId, `✅ Konten: \`${text}\`\nAktifkan proxy?`, {
                        reply_markup: { inline_keyboard: [[{ text: 'ON', callback_data: 'dns_proxy_on' }, { text: 'OFF', callback_data: 'dns_proxy_off' }]] }
                    });
                    break;
            }
        } catch (error) {
            logger.error(`[DNS Msg] ${error.stack}`);
            bot.sendMessage(chatId, `❌ Terjadi kesalahan: ${error.message}`);
            delete userState[chatId];
        }
    });
};

const handle = (bot, userState, callbackQuery, logger) => {
    const { data, message } = callbackQuery;
    const chatId = message.chat.id;

    const action = () => {
        bot.answerCallbackQuery(callbackQuery.id).catch(err => logger.error(`[DNS] answerCallbackQuery failed: ${err.stack}`));
        const state = userState[chatId];

        try {
            if (data === 'dns_proxy_on' || data === 'dns_proxy_off') {
                const proxied = data === 'dns_proxy_on';
                const payload = { type: state.recordType, name: state.recordName, content: state.recordContent, proxied, ttl: 1 };
                axios.post(`${CLOUDFLARE_API_BASE_URL}/zones/${state.zoneId}/dns_records`, payload, { headers: getCfHeaders(state.apiToken) })
                    .then(() => {
                        bot.sendMessage(chatId, `✅ Record ${state.recordType} \`${state.recordName}\` berhasil dibuat!`);
                        delete state.step; delete state.recordType; delete state.recordName; delete state.recordContent;
                        sendDnsMenu(bot, chatId);
                    }).catch(err => { throw err; });
                return;
            }
            if (data.startsWith('dns_delete_confirm_')) {
                const [,, type, id] = data.split('_');
                bot.editMessageText(`Yakin ingin menghapus record ini?`, {
                    chat_id: chatId, message_id: message.message_id,
                    reply_markup: { inline_keyboard: [[{ text: '✅ Ya, Hapus', callback_data: `dns_delete_execute_${type}_${id}` }, { text: '❌ Batal', callback_data: 'dns_menu' }]] }
                });
                return;
            }
            if (data.startsWith('dns_delete_execute_')) {
                const [,,, id] = data.split('_');
                axios.delete(`${CLOUDFLARE_API_BASE_URL}/zones/${state.zoneId}/dns_records/${id}`, { headers: getCfHeaders(state.apiToken) })
                    .then(() => {
                        bot.editMessageText('✅ Record berhasil dihapus.', { chat_id: chatId, message_id: message.message_id });
                        sendDnsMenu(bot, chatId);
                    }).catch(err => { throw err; });
                return;
            }

            switch (data) {
                case 'dns_menu': sendDnsMenu(bot, chatId); break;
                case 'dns_set_a':
                case 'dns_set_cname':
                    userState[chatId] = { ...state, step: 'dns_await_name', recordType: data.includes('_a') ? 'A' : 'CNAME' };
                    bot.sendMessage(chatId, 'Masukkan nama record (e.g., `subdomain` atau `@` untuk root):');
                    break;
                case 'dns_list_a':
                case 'dns_list_cname':
                case 'dns_delete_a':
                case 'dns_delete_cname':
                    const isDelete = data.includes('delete');
                    const type = data.includes('_a') ? 'A' : 'CNAME';
                    bot.sendMessage(chatId, `⏳ Mengambil daftar ${type} record...`);
                    axios.get(`${CLOUDFLARE_API_BASE_URL}/zones/${state.zoneId}/dns_records?type=${type}`, { headers: getCfHeaders(state.apiToken) })
                        .then(res => {
                            const records = res.data.result;
                            if (records.length === 0) {
                                bot.sendMessage(chatId, `Tidak ada ${type} record ditemukan.`);
                                return;
                            }
                            if (isDelete) {
                                const keyboard = records.map(r => ([{ text: `${r.name} ➞ ${r.content}`, callback_data: `dns_delete_confirm_${type}_${r.id}` }]));
                                keyboard.push([{ text: '🔙 Kembali', callback_data: 'dns_menu' }]);
                                bot.sendMessage(chatId, `Pilih ${type} record untuk dihapus:`, { reply_markup: { inline_keyboard: keyboard } });
                            } else {
                                let listText = `📋 *Daftar ${type} Record*\n\n`;
                                records.forEach((r, i) => { listText += `${i + 1}. \`${r.name}\` ➞ \`${r.content}\`\n`; });
                                bot.sendMessage(chatId, listText, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: 'dns_menu' }]] } });
                            }
                        }).catch(err => { throw err; });
                    break;
            }
        } catch (error) {
            const errorMessage = error.response?.data?.errors?.[0]?.message || error.message;
            logger.error(`[DNS Handle] ${error.stack}`);
            bot.sendMessage(chatId, `❌ Terjadi kesalahan pada fitur DNS: ${errorMessage}`);
        }
    };

    ensureLoggedIn(bot, userState, chatId, 'dns', action);
};

module.exports = { register, handle };
