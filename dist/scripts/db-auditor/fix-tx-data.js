import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import Order from "../../app/models/order/order.schema.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/cosmetic_shop";
async function run() {
    try {
        console.log("🚀 Bắt đầu chạy Data Migration Fix...");
        await mongoose.connect(MONGO_URI);
        console.log("✅ Đã kết nối MongoDB.");
        const result = await Order.updateMany({
            paymentStatus: "paid",
            paymentMethod: { $in: ["stripe", "transfer", "bank"] },
            $or: [
                { transactionId: { $exists: false } },
                { transactionId: "" },
                { transactionId: null }
            ]
        }, { $set: { transactionId: "MIGRATED-TX" } });
        console.log(`✅ Cập nhật thành công ${result.modifiedCount} đơn hàng bị thiếu transactionId.`);
    }
    catch (error) {
        console.error("❌ Lỗi:", error);
    }
    finally {
        await mongoose.disconnect();
        console.log("Ngắt kết nối DB.");
        process.exit(0);
    }
}
run();
