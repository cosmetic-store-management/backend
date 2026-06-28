import mongoose from "mongoose";
import dotenv from "dotenv";
import { resolve } from "path";
import User from "../app/models/user/user.schema.js";
dotenv.config({ path: resolve(process.cwd(), ".env") });
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const pipeline = [
        { $match: { role: "customer" } },
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
                completedOrders: {
                    $filter: {
                        input: "$orders",
                        as: "order",
                        cond: { $eq: ["$$order.orderStatus", "completed"] },
                    },
                },
            },
        },
        {
            $addFields: {
                orderCount: { $size: "$completedOrders" },
            },
        },
        {
            $group: {
                _id: "$orderCount",
                count: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ];
    const stats = await User.aggregate(pipeline);
    console.log("Order count distribution among customers:");
    console.log(stats);
    process.exit(0);
}
run();
