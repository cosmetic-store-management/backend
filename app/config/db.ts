import mongoose from "mongoose";

const connectDB = async (uri: string): Promise<void> => {
  if (!uri) {
    console.error("MongoDB connection failed: MONGODB_URI is missing");
    process.exit(1);
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });

  console.log("✅ MongoDB connected");

  mongoose.connection.on("disconnected", () => console.warn("⚠️  MongoDB disconnected"));
  mongoose.connection.on("reconnected",  () => console.log("✅ MongoDB reconnected"));
  mongoose.connection.on("error", (err: Error) => console.error("❌ MongoDB error:", err.message));
};

export default connectDB;
