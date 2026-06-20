# ==========================================
# GIAI ĐOẠN 1: BẾP TRƯỞNG (Xây dựng và Build Code)
# ==========================================
FROM node:20-alpine AS builder
WORKDIR /app

# Cài đặt công cụ pnpm
RUN npm install -g pnpm

# Mang file danh sách thư viện vào trước để cài đặt
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --no-frozen-lockfile

# Mang toàn bộ mã nguồn vào và Build ra thư mục dist
COPY . .
RUN pnpm run build


# ==========================================
# GIAI ĐOẠN 2: NHÂN VIÊN GIAO HÀNG (Đóng gói gọn nhẹ)
# ==========================================
FROM node:20-alpine AS runner
WORKDIR /app

RUN npm install -g pnpm

# Cài lại thư viện nhưng CHỈ cài những thư viện cần thiết cho Production (giúp Container siêu nhẹ)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --no-frozen-lockfile

# Lấy thư mục "dist" đã được nấu chín từ Giai đoạn 1 mang sang đây
COPY --from=builder /app/dist ./dist

# Mở cửa số 5000 để khách hàng gọi vào
EXPOSE 5000

# Lệnh khởi động App
CMD ["pnpm", "start"]
