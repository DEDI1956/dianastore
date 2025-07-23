const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const toml = require('toml'); // Perlu ditambahkan ke package.json

// --- Fungsi Helper ---
const findJsFiles = (dir, fileList = []) => {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            if (file !== 'node_modules') { // Abaikan node_modules
                findJsFiles(filePath, fileList);
            }
        } else if (file.endsWith('.js')) {
            fileList.push(filePath);
        }
    });
    return fileList;
};

const parseEnvAndBindings = (tomlPath) => {
    const neededVars = [];
    if (fs.existsSync(tomlPath)) {
        const config = toml.parse(fs.readFileSync(tomlPath, 'utf-8'));
        if (config.vars) {
            Object.keys(config.vars).forEach(key => neededVars.push({key, type: 'var'}));
        }
        if(config.kv_namespaces) {
            config.kv_namespaces.forEach(kv => neededVars.push({key: kv.binding, type: 'kv'}));
        }
    }
    // Bisa ditambahkan parsing .env.example jika perlu
    return neededVars;
};


// --- Fungsi UI (sendWorkerMenu, etc.) ---
// ... (tetap sama)

const register = (bot, userState, logger) => {
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const state = userState[chatId];
        if (!state || !state.step || !state.step.startsWith('worker_')) return;

        try {
            const text = msg.text.trim();
            // ... (logika login tetap sama)

            switch (state.step) {
                case 'worker_await_repo':
                    state.repoUrl = text;
                    const repoName = path.basename(state.repoUrl, '.git');
                    const localRepoPath = path.join(__dirname, '..', 'temp_workers', repoName);
                    state.localRepoPath = localRepoPath;

                    if (fs.existsSync(localRepoPath)) fs.rmSync(localRepoPath, { recursive: true, force: true });

                    bot.sendMessage(chatId, `Mencoba meng-clone repository...`);
                    exec(`git clone ${state.repoUrl} ${localRepoPath}`, (err) => {
                        if (err) throw new Error(`Gagal clone: ${err.message}`);

                        const jsFiles = findJsFiles(localRepoPath).map(p => path.relative(localRepoPath, p));
                        if (jsFiles.length === 0) throw new Error('Tidak ada file .js yang ditemukan di repository.');

                        const keyboard = jsFiles.map(file => ([{ text: file, callback_data: `worker_set_entry_${file}` }]));
                        bot.sendMessage(chatId, '✅ Repo berhasil di-clone. Pilih file entry point utama:', {
                            reply_markup: { inline_keyboard: keyboard }
                        });
                    });
                    break;
                case 'worker_await_env':
                    const neededVar = state.neededVars[state.currentVarIndex];
                    state.envVars[neededVar.key] = text;
                    state.currentVarIndex++;

                    if (state.currentVarIndex < state.neededVars.length) {
                        const nextVar = state.neededVars[state.currentVarIndex];
                        bot.sendMessage(chatId, `Masukkan nilai untuk \`${nextVar.key}\` (${nextVar.type}):`);
                    } else {
                        bot.sendMessage(chatId, '✅ Semua variabel lingkungan telah diisi. Mengkonfigurasi `wrangler.toml`...');
                        // Lanjutkan ke proses deploy
                        deployWorker(bot, chatId, userState, logger);
                    }
                    break;
            }
        } catch (error) {
            logger.error(`[Worker Msg] ${error.stack}`);
            bot.sendMessage(chatId, `❌ Terjadi kesalahan: ${error.message}`);
            delete userState[chatId];
        }
    });
};

const handle = async (bot, userState, callbackQuery, logger) => {
    // ... (logika login dan menu utama tetap sama)

    try {
        const { data, message } = callbackQuery;
        const chatId = message.chat.id;
        const state = userState[chatId];

        if (data.startsWith('worker_set_entry_')) {
            const entryPoint = data.replace('worker_set_entry_', '');
            state.entryPoint = entryPoint;
            bot.editMessageText(`✅ Entry point diatur ke: \`${entryPoint}\``, { chat_id: chatId, message_id: message.message_id });

            const wranglerTomlPath = path.join(state.localRepoPath, 'wrangler.toml');
            const neededVars = parseEnvAndBindings(wranglerTomlPath);
            state.neededVars = neededVars;
            state.envVars = {};
            state.currentVarIndex = 0;

            if (neededVars.length > 0) {
                state.step = 'worker_await_env';
                const firstVar = neededVars[0];
                bot.sendMessage(chatId, `Variabel lingkungan terdeteksi. Masukkan nilai untuk \`${firstVar.key}\` (${firstVar.type}):`);
            } else {
                bot.sendMessage(chatId, 'Tidak ada variabel lingkungan yang perlu diatur. Memulai deploy...');
                deployWorker(bot, chatId, userState, logger);
            }
            return;
        }

        switch (data) {
            // ... (case list dan delete tetap sama)
        }
    } catch (error) {
        // ...
    }
};

const deployWorker = (bot, chatId, userState, logger) => {
    const state = userState[chatId];
    try {
        const wranglerTomlPath = path.join(state.localRepoPath, 'wrangler.toml');
        let config = {};
        if (fs.existsSync(wranglerTomlPath)) {
            config = toml.parse(fs.readFileSync(wranglerTomlPath, 'utf-8'));
        }

        // Update config
        config.name = state.workerName;
        config.main = state.entryPoint;
        config.account_id = state.accountId;
        if (!config.vars) config.vars = {};

        for (const [key, value] of Object.entries(state.envVars)) {
            const neededVar = state.neededVars.find(v => v.key === key);
            if (neededVar.type === 'var') {
                config.vars[key] = value;
            }
            // Logika untuk bindings lain seperti KV bisa ditambahkan di sini
        }

        // Tulis kembali wrangler.toml versi baru (ini memerlukan library toml-writer)
        // Untuk simple, kita buat string manual
        let newTomlContent = `name = "${config.name}"\nmain = "${config.main}"\naccount_id = "${config.account_id}"\nworkers_dev = true\n\n`;
        if (config.vars && Object.keys(config.vars).length > 0) {
            newTomlContent += "[vars]\n";
            Object.entries(config.vars).forEach(([key, value]) => {
                newTomlContent += `${key} = "${value}"\n`;
            });
        }

        fs.writeFileSync(wranglerTomlPath, newTomlContent);
        bot.sendMessage(chatId, '✅ `wrangler.toml` berhasil dikonfigurasi. Menjalankan `wrangler deploy`...');

        const deployCommand = `cd ${state.localRepoPath} && CLOUDFLARE_API_TOKEN=${state.apiToken} wrangler deploy`;
        exec(deployCommand, (err, stdout, stderr) => {
            if (err) {
                bot.sendMessage(chatId, `❌ Deploy gagal:\n\`\`\`\n${stderr}\n\`\`\``, { parse_mode: 'Markdown' });
            } else {
                bot.sendMessage(chatId, `✅ **Deploy Berhasil**\n\`\`\`\n${stdout}\n\`\`\``, { parse_mode: 'Markdown' });
            }
            fs.rmSync(state.localRepoPath, { recursive: true, force: true });
            delete userState[chatId]; // Hapus semua state setelah selesai
        });

    } catch (error) {
        logger.error(`[Deploy] ${error.stack}`);
        bot.sendMessage(chatId, `❌ Gagal saat proses deploy: ${error.message}`);
        if(state.localRepoPath) fs.rmSync(state.localRepoPath, { recursive: true, force: true });
        delete userState[chatId];
    }
};

module.exports = { register, handle };
