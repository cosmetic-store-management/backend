import mongoose from "mongoose";
import dotenv from "dotenv";
import { resolve } from "path";
import User from "../app/models/user/user.schema.js";
dotenv.config({ path: resolve(process.cwd(), ".env") });
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const result = await User.updateMany({ points: { $lt: 0 } }, { $set: { points: 0 } });
    console.log("Reset negative points for", result.modifiedCount, "users.");
    process.exit(0);
}
run();
