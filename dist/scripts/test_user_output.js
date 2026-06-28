import mongoose from "mongoose";
import dotenv from "dotenv";
import { resolve } from "path";
import User from "../app/models/user/user.schema.js";
dotenv.config({ path: resolve(process.cwd(), ".env") });
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const pipeline = [
        { $match: { role: "customer" } },
        { $limit: 1 }
    ];
    const [result] = await User.aggregate(pipeline);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
}
run().catch(console.error);
