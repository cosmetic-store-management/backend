import mongoose from "mongoose";
import dotenv from "dotenv";
import Variant from "./app/models/product/variant.schema.js";
import Product from "./app/models/product/product.schema.js";
dotenv.config();
async function run() {
    try {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri)
            throw new Error("MONGODB_URI is missing");
        await mongoose.connect(mongoUri);
        console.log("Connected to MongoDB");
        // Regular expression to match common dirty tags in names
        // This matches:
        // - [Hàng Công Ty], [MẪU MỚI], [Sample], [MINISIZE ...]
        // - [SET ...], [MUA ... TẶNG ...]
        // - (No.X), (Màu X)
        // - (Xea), (hộp X miếng), (X miếng), (X + X miếng)
        // - (TONER+...), (Dầu Gội,...)
        // - (Không SPFX)
        const dirtyPatterns = [
            /\[Hàng Công Ty\]/gi,
            /\[MẪU MỚI\]/gi,
            /\[Sample\]/gi,
            /\[MINISIZE.*?\]/gi,
            /\[MUA.*?TẶNG.*?\]/gi,
            /\[SET.*?\]/gi,
            /\(No\.\s*\d+\)/gi,
            /\(Màu\s*\d+\)/gi,
            /\(\d+\s*ea\)/gi,
            /\(hộp\s*\d+\s*miếng\)/gi,
            /\(\d+\s*miếng\)/gi,
            /\(\d+\s*\+\s*\d+\s*miếng\)/gi,
            /\(TONER\+ELMUSION\+CREAM\)/gi,
            /\(Dầu Gội,\s*Sữa Tắm,\s*Dưỡng Thể\)/gi,
            /\(Không\s*SPF.*?\)/gi,
            /\(\d+(\.\d+)?g\*\d+\)/gi, // e.g., (1.3g*2)
            /\(\d+\s*items\)/gi, // e.g., (3items)
            /\(\d+\s*g\)/gi, // e.g., (14 g)
        ];
        const cleanName = (name) => {
            let cleaned = name;
            dirtyPatterns.forEach((pattern) => {
                cleaned = cleaned.replace(pattern, "");
            });
            // Replace multiple spaces with a single space and trim
            return cleaned.replace(/\s{2,}/g, " ").trim();
        };
        let updatedProducts = 0;
        const products = await Product.find({});
        for (const p of products) {
            if (!p.name)
                continue;
            const newName = cleanName(p.name);
            if (newName !== p.name) {
                await Product.updateOne({ _id: p._id }, { $set: { name: newName } });
                updatedProducts++;
            }
        }
        console.log(`Đã làm sạch ${updatedProducts} Sản phẩm.`);
        let updatedVariants = 0;
        const variants = await Variant.find({});
        for (const v of variants) {
            if (!v.name)
                continue;
            const newName = cleanName(v.name);
            if (newName !== v.name) {
                await Variant.updateOne({ _id: v._id }, { $set: { name: newName } });
                updatedVariants++;
            }
        }
        console.log(`Đã làm sạch ${updatedVariants} Phân loại.`);
        process.exit(0);
    }
    catch (error) {
        console.error(error);
        process.exit(1);
    }
}
run();
