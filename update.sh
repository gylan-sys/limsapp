#!/bin/bash

# ==============================================================================
# LIMS App Update Script for Synology NAS
# ==============================================================================
# Skrip ini akan menarik kode terbaru dari GitHub dan memperbarui container Docker.
# Pastikan Anda menjalankan skrip ini dari dalam folder aplikasi di Synology.
# ==============================================================================

echo "--------------------------------------------------"
echo "🚀 Memulai proses pembaruan aplikasi..."
echo "--------------------------------------------------"

# 1. Menarik kode terbaru dari GitHub
echo "📥 Mengambil perubahan terbaru dari GitHub (git pull)..."
git pull
if [ $? -eq 0 ]; then
    echo "✅ Berhasil menarik kode terbaru."
else
    echo "❌ Gagal menarik kode. Pastikan koneksi internet aktif dan kredensial Git benar."
    exit 1
fi

# 2. Membangun ulang dan menjalankan container
echo "🏗️ Membangun ulang (rebuild) dan menjalankan container Docker..."

# Cek apakah menggunakan 'docker-compose' atau 'docker compose'
if command -v docker-compose &> /dev/null; then
    docker-compose up -d --build
else
    docker compose up -d --build
fi

if [ $? -eq 0 ]; then
    echo "✅ Container berhasil diperbarui dan dijalankan."
else
    echo "❌ Gagal membangun ulang container Docker."
    exit 1
fi

echo "--------------------------------------------------"
echo "✨ Pembaruan Selesai! Aplikasi Anda sudah versi terbaru."
echo "--------------------------------------------------"
