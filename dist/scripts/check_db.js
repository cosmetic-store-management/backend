import mongoose from "mongoose";
import dotenv from "dotenv";
import { resolve } from "path";
import User from "../app/models/user/user.schema.js";
import Order from "../app/models/order/order.schema.js";
dotenv.config({ path: resolve(process.cwd(), ".env") });
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected");
    const customer = await User.findOne({ role: "customer" });
    console.log("Customer _id type:", typeof customer?._id, customer?._id);
    console.log("Customer points:", customer?.points);
    const order = await Order.findOne({ userId: customer?._id });
    console.log("Found order for customer:", !!order);
    const anyOrder = await Order.findOne({});
    console.log("Any order userId type:", typeof anyOrder?.userId, anyOrder?.userId);
    const pipeline = [
        { $match: { role: "customer" } },
        { $limit: 1 },
        {
            $lookup: {
                from: "orders",
                localField: "_id",
                foreignField: "userId",
                as: "orders",
            },
        },
        {
            $project: {
                points: 1,
                orderCount: { $size: "$orders" }
            }
        }
    ];
    const agg = await User.aggregate(pipeline);
    console.log("Aggregation output:", JSON.stringify(agg, null, 2));
    process.exit(0);
}
run();
