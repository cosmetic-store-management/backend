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
        const products = await Product.find({}, "name").lean();
        const variants = await Variant.find({}, "name").lean();
        const patternsFound = new Map();
        const examplesFound = new Map();
        const analyzeText = (text) => {
            // Find texts in brackets [ ... ] or ( ... ) or { ... }
            const matches = text.match(/\[.*?\]|\(.*?\)/g);
            if (matches) {
                matches.forEach(match => {
                    // Normalize pattern to count them
                    // e.g. "(HSD: 2025)" -> "(HSD...)"
                    // e.g. "[Hàng Công Ty]" -> "[Hàng Công Ty]"
                    let pattern = match;
                    if (match.toLowerCase().includes("hsd") || match.toLowerCase().includes("date")) {
                        pattern = "[HSD/Date...]";
                    }
                    else if (match.match(/\d/)) {
                        // Contains numbers, might be size/weight or specific promotion
                        pattern = match.replace(/\d+/g, "X");
                    }
                    patternsFound.set(pattern, (patternsFound.get(pattern) || 0) + 1);
                    if (!examplesFound.has(pattern)) {
                        examplesFound.set(pattern, []);
                    }
                    if (examplesFound.get(pattern).length < 3 && !examplesFound.get(pattern).includes(match)) {
                        examplesFound.get(pattern).push(match);
                    }
                });
            }
        };
        products.forEach(p => analyzeText(p.name));
        variants.forEach(v => analyzeText(v.name));
        const sortedPatterns = Array.from(patternsFound.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 30);
        console.log("=== KẾT QUẢ QUÉT DATA ===");
        sortedPatterns.forEach(([pattern, count]) => {
            console.log(`\n- Pattern: ${pattern} (Xuất hiện: ${count} lần)`);
            console.log(`  Ví dụ: ${examplesFound.get(pattern).join(", ")}`);
        });
        process.exit(0);
    }
    catch (error) {
        console.error(error);
        process.exit(1);
    }
}
run();
