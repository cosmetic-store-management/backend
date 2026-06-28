import { getAdminProducts } from './app/modules/product/product.service.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
async function test() {
    await mongoose.connect(process.env.MONGODB_URI);
    const res = await getAdminProducts({ search: 'OGX - Nước hoa nam Cao Cấp' });
    console.dir(res.products[0], { depth: null });
    process.exit(0);
}
test();
