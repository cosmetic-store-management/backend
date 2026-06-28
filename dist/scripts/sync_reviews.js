import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import Product from "../app/models/product/product.schema.js";
import Review from "../app/models/user/review.schema.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../.env") });
async function syncProductReviews() {
    try {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            console.error("❌ MONGODB_URI is missing");
            process.exit(1);
        }
        console.log("⏳ Connecting to MongoDB...");
        await mongoose.connect(mongoUri);
        console.log("✅ Connected to MongoDB");
        console.log("⏳ Aggregating reviews...");
        const stats = await Review.aggregate([
            {
                $group: {
                    _id: "$productId",
                    averageRating: { $avg: "$rating" },
                    totalReviews: { $sum: 1 },
                },
            },
        ]);
        console.log(`Found stats for ${stats.length} products. Updating...`);
        let updatedCount = 0;
        for (const stat of stats) {
            if (stat._id) {
                await Product.findByIdAndUpdate(stat._id, {
                    averageRating: Number(stat.averageRating.toFixed(1)),
                    numReviews: stat.totalReviews,
                });
                updatedCount++;
            }
        }
        // Also reset products that have 0 reviews but might have a stale numReviews > 0
        const productIdsWithReviews = stats.map(s => s._id);
        const zeroUpdate = await Product.updateMany({ _id: { $nin: productIdsWithReviews } }, { $set: { averageRating: 0, numReviews: 0 } });
        console.log(`✅ Updated ${updatedCount} products with reviews.`);
        console.log(`✅ Reset ${zeroUpdate.modifiedCount} products with 0 reviews.`);
        process.exit(0);
    }
    catch (error) {
        console.error("❌ Sync Error:", error);
        process.exit(1);
    }
}
syncProductReviews();
