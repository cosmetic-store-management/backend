import mongoose from "mongoose";
import dotenv from "dotenv";
import { resolve } from "path";
import User from "../app/models/user/user.schema.js";
dotenv.config({ path: resolve(process.cwd(), ".env") });
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const user = await User.findOne({ name: "Xuân Lạc Đào" });
    if (user) {
        console.log("User addresses:", user.addresses);
    }
    else {
        console.log("User not found.");
    }
    process.exit(0);
}
run().catch(console.error);
