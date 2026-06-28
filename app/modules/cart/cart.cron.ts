import cron from "node-cron";
import mongoose from "mongoose";
import Cart from "../../models/cart/cart.schema.js";

// Chạy vào lúc 02:00 sáng mỗi ngày
cron.schedule("0 2 * * *", async () => {
  console.log("[Cart Cron] Bắt đầu dọn dẹp giỏ hàng mồ côi (không hoạt động > 30 ngày)...");
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await Cart.deleteMany({ updatedAt: { $lt: thirtyDaysAgo } });
    if (result.deletedCount > 0) {
      console.log(`[Cart Cron] Đã dọn dẹp thành công ${result.deletedCount} giỏ hàng rác.`);
    } else {
      console.log("[Cart Cron] Không có giỏ hàng rác nào cần dọn.");
    }
  } catch (error: any) {
    console.error("[Cart Cron] Lỗi khi dọn dẹp giỏ hàng:", error.message);
  }
});
