import cron from "node-cron";
import mongoose from "mongoose";
import Cart from "./models/cart.schema.js";
import { logger } from "../../../shared/logger/index.js";

// Chạy vào lúc 02:00 sáng mỗi ngày
cron.schedule("0 2 * * *", async () => {
  logger.info("[Cart Cron] Started cleaning up orphaned carts (inactive > 30 days)...");
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await Cart.deleteMany({ updatedAt: { $lt: thirtyDaysAgo } });
    if (result.deletedCount > 0) {
      logger.info(`[Cart Cron] Đã dọn dẹp thành công ${result.deletedCount} giỏ hàng rác.`);
    } else {
      logger.info("[Cart Cron] No junk carts to clean.");
    }
  } catch (error: any) {
    logger.error("[Cart Cron] Error cleaning up carts:", error.message);
  }
});
