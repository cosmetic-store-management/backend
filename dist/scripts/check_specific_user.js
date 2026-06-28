import mongoose from "mongoose";
import dotenv from "dotenv";
import { resolve } from "path";
import User from "../app/models/user/user.schema.js";
import Order from "../app/models/order/order.schema.js";
dotenv.config({ path: resolve(process.cwd(), ".env") });
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const cust = await User.findOne({ name: "Xuân Minh Ngô" });
    console.log("Customer Xuân Minh Ngô:", cust?._id, cust?.name, "Points:", cust?.points);
    if (cust) {
        const orders = await Order.find({ userId: cust._id });
        console.log("Orders found:", orders.length);
        const completed = await Order.find({ userId: cust._id, orderStatus: "completed" });
        console.log("Completed orders:", completed.length);
    }
    process.exit(0);
}
run();
