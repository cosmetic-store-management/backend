import "dotenv/config";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── [0] Validate env ──────────────────────────────────────────────────────────
import { validateEnv } from "./app/config/env.js";
validateEnv();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";
import morgan from "morgan";
import { globalLimiter } from "./app/middlewares/rateLimit.middleware.js";

import connectDB from "./app/config/db.js";
import healthRouter from "./app/config/health.js";
import authRoutes from "./app/modules/auth/auth.route.js";
import userRoutes from "./app/modules/user/user.route.js";
import productRoutes from "./app/modules/product/product.route.js";
import categoryRoutes from "./app/modules/category/category.route.js";
import orderRoutes from "./app/modules/order/order.route.js";
import brandRoutes from "./app/modules/brand/brand.route.js";
import inventoryRoutes from "./app/modules/inventory/inventory.route.js";
import reportRoutes from "./app/modules/report/report.route.js";
import auditLogRoutes from "./app/modules/audit-log/audit-log.route.js";
import settingRoutes from "./app/modules/setting/setting.route.js";
import uploadRoutes from "./app/modules/upload/upload.route.js";
import voucherRoutes from "./app/modules/voucher/voucher.route.js";
import reviewRoutes from "./app/modules/review/review.route.js";

import cartRoutes from "./app/modules/cart/cart.route.js";
import flashSaleRoutes from "./app/modules/marketing/flash-sale.route.js";
import checkoutRoutes from "./app/modules/order/checkout/checkout.route.js";
import paymentRoutes from "./app/modules/order/payment/payment.route.js";
import shippingRoutes from "./app/modules/order/shipping/shipping.route.js";
import transactionRoutes from "./app/modules/order/transaction/transaction.route.js";
import { errorHandler } from "./app/middlewares/errorHandler.middleware.js";
import passport from "./app/shared/config/passport.js";

const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || "development";
const isDev = NODE_ENV === "development";

app.use(passport.initialize());

// Trust 1 hop proxy (API Gateway) để rate limit dùng IP thật từ X-Forwarded-For
app.set("trust proxy", 1);

if (process.env.NODE_ENV !== "test") {
  await connectDB(process.env.MONGODB_URI!);
}

// ── [1] Logging ───────────────────────────────────────────────────────────────
if (isDev) {
  app.use(morgan("dev"));
} else {
  // Production: structured JSON for log aggregators (Datadog, CloudWatch, etc.)
  app.use(
    morgan((tokens, req, res) => {
      return JSON.stringify({
        ts: tokens.date(req, res, "iso"),
        method: tokens.method(req, res),
        url: tokens.url(req, res),
        status: Number(tokens.status(req, res)),
        ms: Number(tokens["response-time"](req, res)),
        bytes: Number(tokens.res(req, res, "content-length") ?? 0),
        ip: tokens["remote-addr"](req, res),
      });
    }),
  );
}

// ── [2] Security Headers ──────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
    credentials: true,
  }),
);

import { stripeWebhook } from "./app/modules/order/payment/payment.controller.js";

// ── [3] Stripe Webhook ──────────────────────────────
app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhook,
);

// ── [4] Global Rate Limiter ──────────────────────────────────────
app.use(globalLimiter);
// Body Parser
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// ── [5] NoSQL Injection Protection ───────────────────────────────────────────

app.use((req, _res, next) => {
  (["body", "params"] as const).forEach((key) => {
    if (req[key]) req[key] = mongoSanitize.sanitize(req[key]);
  });
  next();
});

// ── [7] Routes ────────────────────────────────────────────────────────────────

app.get("/", (_req, res) => {
  res.json({ success: true, message: "Backend is running", env: NODE_ENV });
});

app.use("/api/health", healthRouter);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/settings", settingRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/vouchers", voucherRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/flash-sales", flashSaleRoutes);
app.use("/api/cart", cartRoutes);

app.use("/api/checkout", checkoutRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/shipping", shippingRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/uploads", uploadRoutes);

// ── [8] 404 Handler ───────────────────────────────────────────────────────────
app.use((req, res) => {
  res
    .status(404)
    .json({
      success: false,
      message: `Route ${req.method} ${req.originalUrl} không tồn tại`,
    });
});

// ── [9] Global Error Handler ──────────────────────────────────────────────────
app.use(errorHandler);

import { startOrderCron } from "./app/modules/order/order.cron.js";
import "./app/modules/cart/cart.cron.js";

if (process.env.NODE_ENV !== "test") {
  const server = app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT} [${NODE_ENV}]`);
  });

  // Start cron jobs
  startOrderCron();

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
    setTimeout(() => {
      console.error("Forced shutdown after 10s");
      process.exit(1);
    }, 10000);
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
