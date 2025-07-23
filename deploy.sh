#!/bin/bash

# Skrip sederhana untuk deployment via webhook
# Pastikan skrip ini memiliki izin eksekusi: chmod +x deploy.sh

# Arahkan ke direktori proyek
# Ganti /path/to/your/bot dengan path absolut ke direktori bot Anda
cd /path/to/your/bot || exit

# Ambil perubahan terbaru dari branch main (atau branch lain yang Anda gunakan)
git pull origin main

# Install dependencies jika ada perubahan di package.json
npm install --production

# Restart bot menggunakan PM2
# Nama proses 'telegram-cf-bot' diambil dari ecosystem.config.js
pm2 restart telegram-cf-bot

echo "Deployment finished at $(date)"
