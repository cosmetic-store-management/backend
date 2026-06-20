import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "app/config/.env") });

// ── [0] Validate env ──────────────────────────────────────────────────────────
import { validateEnv } from "./app/config/env.js";
validateEnv();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoSanitize from "express-mongo-sanitize";
import morgan from "morgan";

import connectDB from "./app/config/db.js";
import healthRouter from "./app/config/health.js";
import authRoutes from "./app/modules/auth/auth.controller.js";
import userRoutes from "./app/modules/user/user.controller.js";
import productRoutes from "./app/modules/product/product.controller.js";
import categoryRoutes from "./app/modules/category/category.controller.js";
import orderRoutes from "./app/modules/order/order.controller.js";
import brandRoutes from "./app/modules/brand/brand.controller.js";
import attributeRoutes from "./app/modules/attribute/attribute.controller.js";
import inventoryRoutes from "./app/modules/inventory/inventory.controller.js";
import reportRoutes from "./app/modules/report/report.controller.js";
import auditLogRoutes from "./app/modules/audit-log/audit-log.controller.js";
import settingRoutes from "./app/modules/setting/setting.controller.js";
import uploadRoutes from "./app/modules/upload/upload.controller.js";
import voucherRoutes from "./app/modules/voucher/voucher.controller.js";
import reviewRoutes from "./app/modules/review/review.controller.js";
import devRoutes from "./app/modules/dev/dev.controller.js";
import { errorHandler } from "./app/middlewares/errorHandler.middleware.js";

const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || "development";
const isDev = NODE_ENV === "development";
const skipRateLimit = process.env.DISABLE_RATE_LIMIT === "true";

// Trust 1 hop proxy (API Gateway) để rate limit dùng IP thật từ X-Forwarded-For
app.set("trust proxy", 1);

if (process.env.NODE_ENV !== "test") {
  await connectDB(process.env.MONGODB_URI!);
}

// ── [1] Logging ───────────────────────────────────────────────────────────────
app.use(morgan(isDev ? "dev" : "combined"));

// ── [2] Security Headers ──────────────────────────────────────────────────────
app.use(helmet());

const allowedOrigins = (process.env.CORS_ORIGIN || "").split(",").map(o => o.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins, credentials: true }));

// ── [4] Body Parser ───────────────────────────────────────────────────────────
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// ── [5] NoSQL Injection Protection ───────────────────────────────────────────

app.use((req, _res, next) => {
  (["body", "params"] as const).forEach((key) => {
    if (req[key]) req[key] = mongoSanitize.sanitize(req[key]);
  });
  next();
});

// Global — chỉ giới hạn trong production
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Quá nhiều yêu cầu, vui lòng thử lại sau" },
  skip: () => skipRateLimit,
});

// Auth routes — brute-force protection
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Quá nhiều yêu cầu từ IP này, vui lòng thử lại sau 15 phút" },
  skip: () => skipRateLimit,
});

// ── [7] Routes ────────────────────────────────────────────────────────────────
app.use(globalLimiter);  // áp dụng cho tất cả routes

app.get("/", (_req, res) => {
  res.json({ success: true, message: "Backend is running", env: NODE_ENV });
});

app.use("/api/health", healthRouter);
app.use("/api/auth", authLimiter, authRoutes);  // authLimiter ghi đè globalLimiter cho auth
app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/attributes", attributeRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/settings", settingRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/vouchers", voucherRoutes);
app.use("/api/reviews", reviewRoutes);
if (isDev) {
  app.use("/api/dev", devRoutes);
}

// Static file serving for uploads
app.use("/api/uploads", express.static(join(__dirname, "uploads")));


// ── [8] 404 Handler ───────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.originalUrl} không tồn tại` });
});

// ── [9] Global Error Handler ──────────────────────────────────────────────────
app.use(errorHandler);

if (process.env.NODE_ENV !== "test") {
  const server = app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT} [${NODE_ENV}]`);
  });

  // ── [11] Graceful Shutdown ────────────────────────────────────────────────────
  const gracefulShutdown = (signal: string): void => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server.close(async () => {
      console.log("HTTP server closed");
      try {
        const mongoose = (await import("mongoose")).default;
        await mongoose.connection.close();
        console.log("MongoDB connection closed");
      } catch (err) {
        console.error("Error closing MongoDB connection:", err);
      }
      process.exit(0);
    });
    setTimeout(() => { console.error("Forced shutdown after 10s"); process.exit(1); }, 10000);
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

export { app };

// ── [12] Process Error Handlers ───────────────────────────────────────────────
process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Promise Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
  process.exit(1);
});
