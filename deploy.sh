#!/bin/bash

# Script cập nhật môi trường (env), cập nhật code và khởi động lại Backend

# Đường dẫn tới thư mục chứa code backend trên VPS (Vui lòng kiểm tra và sửa lại nếu cần)
PROJECT_DIR="/var/www/cosmetic-shop/backend"
PM2_APP_NAME="cosmetic-backend" # Tên ứng dụng đang chạy trong PM2

echo "=> Di chuyển vào thư mục dự án: $PROJECT_DIR"
cd $PROJECT_DIR || { echo "Thư mục không tồn tại!"; exit 1; }

# Kéo code mới nhất từ Github về (Bạn đã commit và push lên main trước đó)
echo "=> Đang lấy code mới nhất từ Git..."
git pull origin main

# Hàm hỗ trợ cập nhật hoặc thêm mới biến môi trường vào file .env
update_env() {
    key=$1
    value=$2
    # Nếu biến đã tồn tại, thay thế giá trị
    if grep -q "^$key=" .env; then
        sed -i "s|^$key=.*|$key=$value|" .env
    else
        # Nếu chưa tồn tại, thêm mới vào cuối file
        echo "$key=$value" >> .env
    fi
}

echo "=> Đang cập nhật cấu hình .env..."
# =========================================================================
# THÊM HOẶC SỬA CÁC BIẾN MÔI TRƯỜNG Ở ĐÂY
# Cú pháp: update_env "TÊN_BIẾN" "GIÁ_TRỊ"
# VD: update_env "PORT" "5000"
# =========================================================================


# Cài đặt các gói thư viện mới (nếu package.json có thay đổi)
echo "=> Đang cài đặt dependencies..."
pnpm install

# Build lại dự án TypeScript ra JavaScript
echo "=> Đang build dự án..."
pnpm run build

# Khởi động lại dịch vụ bằng PM2
echo "=> Khởi động lại PM2..."
pm2 reload $PM2_APP_NAME --update-env

echo "✅ Hoàn tất quá trình cập nhật môi trường và vá lỗi server!"
