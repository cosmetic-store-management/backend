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
        console.log("Connected to MongoDB");
        const variants = await Variant.find({});
        let updatedCount = 0;
        for (const variant of variants) {
            let newName = variant.name || "Mặc định";
            // Xóa text ví dụ như "(No.1)", "(No. 2)", "No.1", v.v.
            newName = newName.replace(/\(No\.\s*\d+\)/gi, "").trim();
            newName = newName.replace(/No\.\s*\d+/gi, "").trim();
            // Vá lỗi mã sku: Tạo mã SKU mới sạch sẽ và duy nhất
            const newSku = `SKU-${variant._id.toString().slice(-8).toUpperCase()}`;
            await Variant.updateOne({ _id: variant._id }, { $set: { name: newName, sku: newSku } });
            updatedCount++;
        }
        console.log(`Đã vá thành công ${updatedCount} variants (Fix SKU và xóa chữ No.X).`);
        process.exit(0);
    }
    catch (error) {
        console.error(error);
        process.exit(1);
    }
}
run();
