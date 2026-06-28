# Cosmetic Shop Backend

> **Stack:** Express 5 · TypeScript · Mongoose (MongoDB) · Zod · JWT  
> **Kiến trúc:** Modular 3-Tier — Controller → Service → Repository

---

## Cấu trúc dự án

```
cnpm-be/
├── server.ts                         # Entry point
├── app/
│   ├── models/                       # Mongoose schemas
│   │   ├── user.schema.ts
│   │   ├── product.schema.ts
│   │   ├── variant.schema.ts
│   │   ├── order.schema.ts
│   │   ├── voucher.schema.ts
│   │   ├── review.schema.ts
│   │   ├── category.schema.ts
│   │   ├── brand.schema.ts
│   │   ├── supplier.schema.ts
│   │   ├── inventory-transaction.schema.ts
│   │   ├── audit-log.schema.ts
│   │   ├── point-history.schema.ts
│   │   └── ...
│   ├── modules/                      # Business logic (3-tier mỗi module)
│   │   ├── auth/                     # Xác thực & phân quyền
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.repository.ts
│   │   │   └── dto/
│   │   │       ├── auth.request.dto.ts
│   │   │       └── auth.response.dto.ts
│   │   ├── user/                     # Quản lý người dùng
│   │   ├── product/                  # Sản phẩm & biến thể
│   │   ├── order/                    # Đơn hàng & checkout
│   │   │   ├── order.service.ts
│   │   │   ├── order.repository.ts
│   │   │   ├── order.checkout.ts     # Checkout logic
│   │   │   ├── order.payment.ts      # VNPay integration
│   │   │   ├── order.shipping.ts     # Shipping fee calculation
│   │   │   └── order.helper.ts       # Constants & helpers
│   │   ├── voucher/                  # Voucher & wallet
│   │   ├── review/                   # Đánh giá sản phẩm
│   │   ├── inventory/                # Kho hàng & nhập hàng
│   │   ├── audit-log/                # Nhật ký hành động admin
│   │   ├── category/                 # Danh mục
│   │   ├── brand/                    # Thương hiệu
│   │   ├── setting/                  # Cấu hình hệ thống
│   │   └── dev/                      # Tools phát triển
│   ├── middlewares/
│   │   ├── auth.middleware.ts        # JWT authentication
│   │   └── validate.middleware.ts    # Zod validation
│   └── shared/
│       ├── errors/
│       │   └── httpErrors.ts         # Custom HTTP errors
│       ├── helpers/
│       │   ├── response.ts           # Response helpers
│       │   ├── catchAsync.ts
│       │   └── sanitize.ts
│       └── email/
│           └── email.service.ts      # SendGrid/Resend
├── tests/
│   ├── unit/                         # Vitest unit tests (mock repository)
│   │   ├── auth.service.test.ts
│   │   ├── voucher.service.test.ts
│   │   ├── review.service.test.ts
│   │   ├── inventory.service.test.ts
│   │   ├── order.service.test.ts
│   │   └── product.service.test.ts
│   └── integration/                  # Vitest integration tests (mongodb-memory-server)
│       ├── helpers/
│       │   └── db-helper.ts          # Shared test DB setup
│       ├── auth.integration.test.ts
│       ├── voucher.integration.test.ts
│       ├── review.integration.test.ts
│       ├── inventory.integration.test.ts
│       ├── product.integration.test.ts
│       └── order.integration.test.ts
├── vitest.config.ts
└── package.json
```

---

## Cài đặt & Chạy

```bash
# Cài dependencies
npm install

# Dev server (hot reload)
npm run dev

# TypeScript check
npm run typecheck

# Build production
npm run build
```

---

## Biến môi trường

Tạo file `.env` tại root `cnpm-be/`:

```env
MONGODB_URI=mongodb://localhost:27017/cosmetic-shop
JWT_SECRET=your_jwt_secret_min_32_chars
JWT_REFRESH_SECRET=your_refresh_secret_min_32_chars
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# SendGrid hoặc Resend (chọn 1)
SENDGRID_API_KEY=your_key
RESEND_API_KEY=your_key
FROM_EMAIL=no-reply@yourdomain.com

PORT=8000
NODE_ENV=development
```

---

## Chạy Tests

```bash
# Tất cả tests (unit + integration)
npm test

# Chỉ unit tests (nhanh, không cần DB)
npm run test:unit

# Chỉ integration tests (dùng mongodb-memory-server)
npm run test:integration

# Watch mode (phát triển)
npm run test:watch

# Coverage report
npm run test:coverage
```

---

## API Endpoints

### Auth (`/api/auth`)

| Method | Path               | Mô tả                         |
| ------ | ------------------ | ----------------------------- |
| POST   | `/register`        | Đăng ký tài khoản             |
| POST   | `/public/login`    | Đăng nhập khách hàng          |
| POST   | `/admin/login`     | Đăng nhập quản trị            |
| POST   | `/refresh`         | Làm mới access token          |
| POST   | `/logout`          | Đăng xuất                     |
| GET    | `/me`              | Thông tin người dùng hiện tại |
| POST   | `/change-password` | Đổi mật khẩu                  |
| POST   | `/forgot-password` | Quên mật khẩu                 |
| POST   | `/reset-password`  | Đặt lại mật khẩu              |

### Products (`/api/products`)

| Method | Path         | Mô tả                        |
| ------ | ------------ | ---------------------------- |
| GET    | `/`          | Danh sách sản phẩm công khai |
| GET    | `/:slug`     | Chi tiết sản phẩm            |
| GET    | `/admin/all` | Danh sách admin (auth)       |
| POST   | `/admin`     | Tạo sản phẩm (admin)         |
| PUT    | `/admin/:id` | Cập nhật sản phẩm (admin)    |
| DELETE | `/admin/:id` | Xóa sản phẩm (admin)         |

### Orders (`/api/orders`)

| Method | Path                | Mô tả                         |
| ------ | ------------------- | ----------------------------- |
| GET    | `/my-orders`        | Đơn hàng của tôi              |
| POST   | `/preview`          | Xem trước đơn hàng (checkout) |
| POST   | `/`                 | Tạo đơn hàng                  |
| POST   | `/:id/cancel`       | Hủy đơn hàng                  |
| GET    | `/admin/all`        | Tất cả đơn hàng (admin)       |
| PATCH  | `/admin/:id/status` | Cập nhật trạng thái (admin)   |

### Vouchers (`/api/vouchers`)

| Method | Path              | Mô tả                           |
| ------ | ----------------- | ------------------------------- |
| POST   | `/validate`       | Kiểm tra voucher trước checkout |
| GET    | `/wallet`         | Ví voucher của tôi              |
| POST   | `/wallet/collect` | Lưu voucher vào ví              |
| GET    | `/admin/all`      | Tất cả vouchers (admin)         |
| POST   | `/admin`          | Tạo voucher (admin)             |
| PUT    | `/admin/:id`      | Cập nhật voucher (admin)        |

### Reviews (`/api/reviews`)

| Method | Path           | Mô tả                                |
| ------ | -------------- | ------------------------------------ |
| GET    | `/product/:id` | Reviews của sản phẩm                 |
| POST   | `/`            | Tạo review (auth, verified purchase) |
| PUT    | `/:id`         | Cập nhật review (chủ review)         |
| DELETE | `/:id`         | Xóa review                           |
| GET    | `/admin/all`   | Tất cả reviews (admin)               |

### Inventory (`/api/inventory`)

| Method | Path              | Mô tả                         |
| ------ | ----------------- | ----------------------------- |
| GET    | `/suppliers`      | Danh sách nhà cung cấp        |
| POST   | `/suppliers`      | Tạo nhà cung cấp              |
| POST   | `/goods-receipts` | Nhập kho                      |
| GET    | `/goods-receipts` | Lịch sử nhập kho              |
| POST   | `/stock/adjust`   | Điều chỉnh tồn kho (kiểm kho) |
| GET    | `/stock/low`      | Cảnh báo hàng sắp hết         |

---

## Kiến trúc

### 3-Tier Architecture

```
HTTP Request
    ↓
Controller (routing, request parsing, response)
    ↓
Service (business logic, validation, orchestration)
    ↓
Repository (data access, DB queries)
    ↓
Mongoose Schema (MongoDB)
```

### DTOs (Data Transfer Objects)

- **Request DTOs**: Zod schemas cho input validation (`*.request.dto.ts`)
- **Response DTOs**: Interface + mapper function để transform DB documents (`*.response.dto.ts`)

Ví dụ chuẩn:

```typescript
// product.response.dto.ts
export interface ProductResponse { id: string; name: string; slug: string; ... }
export const mapProduct = (p: ProductDocument): ProductResponse => ({ ... });

// product.service.ts
const products = await productRepo.findPublic(query, skip, limit);
return products.map(mapProduct); // Luôn map qua DTO
```

### Error Handling

```typescript
// shared/errors/httpErrors.ts
throw badRequest("Validation error"); // 400
throw unauthorized("Token hết hạn"); // 401
throw forbidden("Không có quyền"); // 403
throw notFound("Không tìm thấy"); // 404
throw conflict("Đã tồn tại"); // 409
```

---

## Bảo mật

- **Helmet** - Security headers
- **express-mongo-sanitize** - NoSQL injection protection
- **express-rate-limit** - Rate limiting
- **bcryptjs** - Password hashing (salt rounds: 12)
- **JWT** - Stateless auth với access token (15m) + refresh token (7d) rotation
- **sanitize-html** - XSS protection cho rich text (product description)
- **Zod** - Schema validation cho tất cả input

---

## Luồng Checkout

```
Preview Order → Validate Voucher → Check Stock → Create Order
→ Increment Voucher Usage → Deduct Stock → Send Confirmation Email
```

Khi hủy/trả hàng:

```
Cancel/Return Order → Restore Stock → Decrement Voucher Usage
→ Restore Points → Refund (if paid)
```
