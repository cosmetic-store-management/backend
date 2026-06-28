import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();
async function run() {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/cosmetic-shop");
    const db = mongoose.connection.db;
    const user = await db.collection("users").findOne({ email: "admin@glowup.com" });
    console.log("User:", user);
    process.exit(0);
}
run();
