import cron from "node-cron";
import mongoose from "mongoose";
import Cart from "./models/cart.schema.js";
import { logger } from "../../../shared/logger/index.js";

// Chạy vào lúc 02:00 sáng mỗi ngày
cron.schedule("0 2 * * *", async () => {
  logger.info("[Cart Cron] Bắt đầu dọn dẹp giỏ hàng mồ côi (không hoạt động > 30 ngày)...");
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await Cart.deleteMany({ updatedAt: { $lt: thirtyDaysAgo } });
    if (result.deletedCount > 0) {
      logger.info(`[Cart Cron] Đã dọn dẹp thành công ${result.deletedCount} giỏ hàng rác.`);
    } else {
      logger.info("[Cart Cron] Không có giỏ hàng rác nào cần dọn.");
    }
  } catch (error: any) {
    logger.error("[Cart Cron] Lỗi khi dọn dẹp giỏ hàng:", error.message);
  }
});
