import mongoose from "mongoose";
const connectDB = async (uri) => {
    if (!uri) {
        console.error("MongoDB connection failed: MONGODB_URI is missing");
        process.exit(1);
    }
    await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        maxPoolSize: 200, // Tối ưu cho 100-200 CCU (tránh nghẽn connection khi chạy Transactions)
        minPoolSize: 20,
    });
    console.log("✅ MongoDB connected");
    mongoose.connection.on("disconnected", () => console.warn("⚠️  MongoDB disconnected"));
    mongoose.connection.on("reconnected", () => console.log("✅ MongoDB reconnected"));
    mongoose.connection.on("error", (err) => console.error("❌ MongoDB error:", err.message));
};
export default connectDB;
