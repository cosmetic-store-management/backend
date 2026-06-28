import mongoose from "mongoose";
import dotenv from "dotenv";
import Variant from "./app/models/product/variant.schema.js";
dotenv.config();
async function run() {
    try {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri)
            throw new Error("MONGODB_URI is missing");
        await mongoose.connect(mongoUri);
        const result = await Variant.updateMany({ name: "Mặc định" }, { $set: { name: "Default Title" } });
        console.log(`Đã đổi lại tên cho ${result.modifiedCount} phân loại (từ "Mặc định" sang "Default Title")`);
        process.exit(0);
    }
    catch (error) {
        console.error(error);
        process.exit(1);
    }
}
run();
