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
                name: 1,
                email: 1,
                phone: 1,
                points: 1,
                isActive: 1,
                createdAt: 1,
                password: 1,
                providers: 1,
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
                totalSpent: { $sum: "$completedOrders.totalAmount" },
                lastPurchaseDate: { $max: "$completedOrders.createdAt" },
                hasOnlineAccount: {
                    $cond: [
                        {
                            $or: [
                                { $ifNull: ["$password", false] },
                                { $gt: [{ $size: { $ifNull: ["$providers", []] } }, 0] },
                            ],
                        },
                        true,
                        false,
                    ],
                },
            },
        },
        { $limit: 3 }
    ];
    const users = await User.aggregate(pipeline);
    console.log("Users:", JSON.stringify(users, null, 2));
    process.exit(0);
}
run();
