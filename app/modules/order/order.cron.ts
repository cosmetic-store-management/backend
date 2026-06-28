import mongoose from "mongoose";
import Order from "../../models/order/order.schema.js";
import { abandonPendingOrder } from "./order.service.js";

// Chạy mỗi phút 1 lần
const CRON_INTERVAL = 60 * 1000;
// Thời gian hết hạn của đơn hàng chờ thanh toán (15 phút)
const EXPIRE_MINUTES = 15;

export const startOrderCron = () => {
  let isRunning = false;

  setInterval(async () => {
    if (isRunning) {
      console.log("[Order Cron] Bỏ qua vòng lặp do tiến trình trước chưa hoàn thành.");
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

      for (const order of expiredOrders) {
        try {
          await abandonPendingOrder(order.code);
          console.log(`[Order Cron] Đã hủy QR quá hạn (15p): ${order.code}`);
        } catch (err: any) {
          console.error(`[Order Cron] Lỗi khi hủy đơn hàng ${order.code}:`, err.message);
        }
      }
    } catch (error) {
      console.error("[Order Cron] Lỗi khi quét QR hết hạn:", error);
    } finally {
      isRunning = false;
    }
  }, CRON_INTERVAL);
  
  console.log(`[Order Cron] Đã khởi chạy cron hủy QR (chu kỳ: 1 phút, hạn: ${EXPIRE_MINUTES} phút)`);
};
