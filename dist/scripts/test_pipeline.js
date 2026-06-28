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
            $facet: {
                data: [
                    { $limit: 1 },
                    { $project: { completedOrders: 0, password: 0 } },
                ],
            },
        },
    ];
    const [result] = await User.aggregate(pipeline);
    const u = result.data[0];
    const defaultAddress = (u.addresses || []).find((a) => a.isDefault) || (u.addresses || [])[0] || {};
    console.log("u.addresses: ", u.addresses);
    console.log("Mapped Province: ", defaultAddress.province || "");
    process.exit(0);
}
run().catch(console.error);
