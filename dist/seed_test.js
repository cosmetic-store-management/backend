import mongoose from "mongoose";
import * as dotenv from "dotenv";
dotenv.config();
async function check() {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/cosmetic-shop");
    console.log('Categories:', await mongoose.connection.db.collection('categories').countDocuments());
    console.log('Products:', await mongoose.connection.db.collection('products').countDocuments());
    console.log('Users:', await mongoose.connection.db.collection('users').countDocuments());
    process.exit(0);
}
check();
