# Telegram Cloudflare Bot

Bot Telegram untuk mengelola Cloudflare DNS dan Workers dengan mudah melalui VPS DigitalOcean.

## Fitur

- **Manajemen DNS**:
  - Set A Record
  - Set CNAME Record
  - List A Records
  - List CNAME Records
- **Manajemen Workers**:
  - Deploy Worker dari repository GitHub
  - List Workers

## Instalasi

1.  **Clone repository ini:**
    ```bash
    git clone https://github.com/your-username/telegram-cf-bot.git
    cd telegram-cf-bot
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

## Konfigurasi

1.  Buka file `config.js`.
2.  Ganti `YOUR_TELEGRAM_BOT_TOKEN` dengan token bot Telegram Anda.
3.  (Opsional) Anda bisa mengisi kredensial Cloudflare di `config.js` atau memberikannya melalui bot.

## Menjalankan Bot

Untuk menjalankan bot, gunakan perintah berikut:

```bash
node index.js
```

### Menjalankan dengan PM2

Untuk menjalankan bot sebagai service di latar belakang, Anda bisa menggunakan PM2.

1.  **Install PM2 secara global:**
    ```bash
    npm install pm2 -g
    ```

2.  **Jalankan bot menggunakan file `ecosystem.config.js`:**
    ```bash
    pm2 start ecosystem.config.js
    ```

3.  **Untuk melihat log:**
    ```bash
    pm2 logs
    ```

4.  **Untuk menghentikan bot:**
    ```bash
    pm2 stop ecosystem.config.js
    ```

## Systemd Service (Alternatif PM2)

Jika Anda lebih suka menggunakan `systemd` di Ubuntu, buat file service baru:

```bash
sudo nano /etc/systemd/system/telegram-bot.service
```

Isi dengan konten berikut (sesuaikan `User`, `Group`, `WorkingDirectory`, dan `ExecStart`):

```ini
[Unit]
Description=Telegram Cloudflare Bot
After=network.target

[Service]
User=root
Group=root
WorkingDirectory=/root/telegram-cf-bot
ExecStart=/usr/bin/node /root/telegram-cf-bot/index.js
Restart=always

[Install]
WantedBy=multi-user.target
```

Kemudian, aktifkan dan jalankan service:

```bash
sudo systemctl daemon-reload
sudo systemctl start telegram-bot
sudo systemctl enable telegram-bot
```
