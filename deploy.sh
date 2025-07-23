#!/bin/bash

# Skrip sederhana untuk deployment via webhook
# Pastikan skrip ini memiliki izin eksekusi: chmod +x deploy.sh

# Arahkan ke direktori proyek
# GANTI /path/to/your/bot dengan path absolut ke direktori bot Anda
PROJECT_DIR="/path/to/your/bot"
cd "$PROJECT_DIR" || exit

echo "Navigated to $PROJECT_DIR"

# Ambil perubahan terbaru dari branch main
echo "Pulling latest changes from origin main..."
git pull origin main

# Install dependencies jika ada perubahan di package.json
echo "Installing/updating npm dependencies..."
npm install --production

# Restart bot menggunakan PM2
PROCESS_NAME="telegram-cf-bot" # Nama dari ecosystem.config.js
echo "Attempting to restart PM2 process: $PROCESS_NAME..."

# Cek jika proses ada, jika tidak, start
pm2 describe $PROCESS_NAME > /dev/null
if [ $? -eq 0 ]; then
  pm2 restart $PROCESS_NAME
  echo "Process $PROCESS_NAME restarted."
else
  echo "Process $PROCESS_NAME not found. Starting it..."
  # Jika menggunakan webhook, Anda akan menjalankan webhook.js
  # Jika polling, Anda akan menjalankan index.js
  # Anda bisa menggunakan variabel env untuk mengontrol ini, atau hardcode.
  # Contoh: pm2 start webhook.js --name $PROCESS_NAME
  pm2 start ecosystem.config.js
  echo "Process started via ecosystem.config.js."
fi

echo "Deployment finished at $(date)"
