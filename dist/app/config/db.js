import mongoose from "mongoose";
import { logger } from "../shared/logger/index.js";
const connectDB = async (uri) => {
    if (!uri) {
        logger.error("MongoDB connection failed: MONGODB_URI is missing");
        process.exit(1);
    }
    await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        maxPoolSize: 200, // Tối ưu cho 100-200 CCU (tránh nghẽn connection khi chạy Transactions)
        minPoolSize: 20,
    });
    logger.info("✅ MongoDB connected");
    mongoose.connection.on("disconnected", () => console.warn("⚠️  MongoDB disconnected"));
    mongoose.connection.on("reconnected", () => logger.info("✅ MongoDB reconnected"));
    mongoose.connection.on("error", (err) => logger.error({ err: err.message }, "❌ MongoDB error:"));
};
export default connectDB;
