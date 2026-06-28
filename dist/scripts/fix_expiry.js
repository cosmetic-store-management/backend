import mongoose from "mongoose";
import dotenv from "dotenv";
import Batch from "../app/models/inventory/batch.schema.js";
dotenv.config();
async function run() {
    const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/cosmetic-shop";
    await mongoose.connect(uri);
    console.log("Connected to MongoDB.");
    // set expiry date to 2.5 years from now
    const futureExpiry = new Date();
    futureExpiry.setFullYear(futureExpiry.getFullYear() + 2);
    futureExpiry.setMonth(futureExpiry.getMonth() + 6);
    // set manufacture date to 6 months ago
    const pastManufacture = new Date();
    pastManufacture.setMonth(pastManufacture.getMonth() - 6);
    const result = await Batch.updateMany({}, {
        $set: {
            expiryDate: futureExpiry,
            manufactureDate: pastManufacture,
        },
    });
    console.log(`Updated ${result.modifiedCount} batches successfully.`);
    await mongoose.disconnect();
}
run().catch(console.error);
