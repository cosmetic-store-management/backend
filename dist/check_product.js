import mongoose from "mongoose";
import dotenv from "dotenv";
import Product from "./app/models/product/product.schema.js";
dotenv.config();
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const products = await Product.find({ name: /Nước hoa hồng chiết xuất từ hạt xoài/i }).populate('variants');
    console.log(JSON.stringify(products, null, 2));
    process.exit(0);
}
run();
