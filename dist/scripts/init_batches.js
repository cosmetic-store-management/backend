import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import Variant from "../app/models/product/variant.schema.js";
import Batch from "../app/models/inventory/batch.schema.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });
async function initBatches() {
    try {
        const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/cosmetic_shop";
        await mongoose.connect(mongoUri);
        console.log("Connected to MongoDB for batch initialization.");
        const variants = await Variant.find({ stock: { $gt: 0 } });
        console.log(`Found ${variants.length} variants with stock > 0.`);
        let createdCount = 0;
        for (const variant of variants) {
            // Check if a batch already exists
            const existingBatch = await Batch.findOne({ variantId: variant._id });
            if (!existingBatch) {
                // Default import price = 60% of current price (40% profit margin default)
                const importPrice = Math.round(variant.price * 0.6);
                await Batch.create({
                    variantId: variant._id,
                    goodsReceiptId: null,
                    importPrice,
                    originalQty: variant.stock,
                    remainingQty: variant.stock,
                });
                createdCount++;
            }
        }
        console.log(`Initialization complete. Created ${createdCount} initial batches.`);
    }
    catch (error) {
        console.error("Error initializing batches:", error);
    }
    finally {
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB.");
    }
}
initBatches();
