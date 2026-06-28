import mongoose from "mongoose";
import dotenv from "dotenv";
import { resolve } from "path";
import User from "../app/models/user/user.schema.js";
dotenv.config({ path: resolve(process.cwd(), ".env") });
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const users = await User.find({ name: "Xuân Lạc Đào" });
    console.log(`Found ${users.length} users named Xuân Lạc Đào.`);
    for (const u of users) {
        console.log(`User ID: ${u._id}`);
        console.log(`Addresses length: ${u.addresses ? u.addresses.length : 0}`);
    }
    process.exit(0);
}
run().catch(console.error);
