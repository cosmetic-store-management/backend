import mongoose from "mongoose";
import dotenv from "dotenv";
import { resolve } from "path";
import Order from "../app/models/order/order.schema.js";
import PaymentTransaction from "../app/models/order/payment-transaction.schema.js";
import InventoryTransaction from "../app/models/inventory/inventory-transaction.schema.js";
dotenv.config({ path: resolve(process.cwd(), ".env") });
async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB");
        // Chỉ tìm những đơn hàng do giả lập sinh ra có trạng thái cancelled và payment thất bại
        const failedOrders = await Order.find({ orderStatus: "cancelled" });
        const orderIds = failedOrders.map(o => o._id);
        console.log(`Found ${orderIds.length} abandoned/cancelled orders to remove.`);
        if (orderIds.length > 0) {
            await Order.deleteMany({ _id: { $in: orderIds } });
            await PaymentTransaction.deleteMany({ orderId: { $in: orderIds } });
            await InventoryTransaction.deleteMany({ reference: { $in: orderIds } });
            console.log("Deleted abandoned orders and related transactions successfully");
        }
        process.exit(0);
    }
    catch (err) {
        console.error(err);
        process.exit(1);
    }
}
run();
