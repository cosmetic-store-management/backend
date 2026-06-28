import mongoose from "mongoose";
import dotenv from "dotenv";
import Variant from "./app/models/product/variant.schema.js";
import Product from "./app/models/product/product.schema.js";
dotenv.config();
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const variant = await Variant.findOne({ name: /Mẫu mới hộp 150ml/i });
    console.log("Variant:", variant);
    if (variant) {
        const product = await Product.findById(variant.productId).populate('variants');
        console.log("Product:", product);
    }
    process.exit(0);
}
run();
