import mongoose from "mongoose";
import Order from "./models/order.schema.js";
import { container } from "tsyringe";
import { OrderService } from "./order.service.js";
import { logger } from "../../../shared/logger/index.js";

// Chạy mỗi phút 1 lần
const CRON_INTERVAL = 60 * 1000;
// Thời gian hết hạn của đơn hàng chờ thanh toán (15 phút)
const EXPIRE_MINUTES = 15;

export const startOrderCron = () => {
  let isRunning = false;
  // Resolve OrderService here (lazily) to avoid circular dependencies
  // at module initialization time.

  setInterval(async () => {
    if (isRunning) {
      logger.info("[Order Cron] Bỏ qua vòng lặp do tiến trình trước chưa hoàn thành.");
      return;
    }

    isRunning = true;
    try {
      const expireTime = new Date(Date.now() - EXPIRE_MINUTES * 60 * 1000);
      
      const expiredOrders = await Order.find({
        orderStatus: "pending",
        paymentMethod: { $in: ["bank", "transfer", "stripe"] },
        createdAt: { $lt: expireTime }
      }).limit(50); // Chỉ xử lý tối đa 50 đơn mỗi phút để tránh Write Conflict & SMTP Throttling

      if (expiredOrders.length > 0) {
        const orderService = container.resolve(OrderService);
        for (const order of expiredOrders) {
          try {
            await orderService.cancelPendingOrder(order.code, "Hủy tự động do quá hạn thanh toán");
            logger.info(`[Order Cron] Đã hủy đơn hàng quá hạn (15p): ${order.code}`);
          } catch (err: any) {
            logger.error({ err: err.message }, `[Order Cron] Lỗi khi hủy đơn hàng ${order.code}:`);
          }
        }
      }
    } catch (error) {
      logger.error({ err: error }, "[Order Cron] Lỗi khi quét QR hết hạn:");
    } finally {
      isRunning = false;
    }
  }, CRON_INTERVAL);
  
  logger.info(`[Order Cron] Đã khởi chạy cron hủy QR (chu kỳ: 1 phút, hạn: ${EXPIRE_MINUTES} phút)`);
};
