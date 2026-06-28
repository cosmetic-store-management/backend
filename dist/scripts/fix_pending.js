import mongoose from "mongoose";
import dotenv from "dotenv";
import Order from "../app/models/order/order.schema.js";
dotenv.config();
mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/cosmetic-shop").then(async () => {
    try {
        const res = await Order.updateMany({ orderStatus: "pending" }, { $set: { orderStatus: "cancelled", note: "Hủy tự động các đơn pending từ Seeding" } });
        console.log("Cancelled pending seeded orders:", res.modifiedCount);
    }
    catch (e) {
        console.error(e);
    }
    finally {
        process.exit(0);
    }
});
