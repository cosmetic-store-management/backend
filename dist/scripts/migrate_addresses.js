import mongoose from "mongoose";
import dotenv from "dotenv";
import { resolve } from "path";
import User from "../app/models/user/user.schema.js";
import Order from "../app/models/order/order.schema.js";
dotenv.config({ path: resolve(process.cwd(), ".env") });
async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");
    const usersWithoutAddress = await User.find({
        $or: [{ addresses: { $exists: false } }, { addresses: { $size: 0 } }],
    });
    console.log(`Found ${usersWithoutAddress.length} users without addresses.`);
    let updatedCount = 0;
    for (const user of usersWithoutAddress) {
        const lastOrder = await Order.findOne({ userId: user._id }).sort({ createdAt: -1 });
        if (lastOrder && lastOrder.province) {
            user.addresses = [
                {
                    isDefault: true,
                    name: lastOrder.receiverName || user.name,
                    phone: lastOrder.phone || user.phone,
                    province: lastOrder.province || "Hà Nội",
                    district: lastOrder.district || "Cầu Giấy",
                    ward: lastOrder.ward || "Dịch Vọng",
                    street: lastOrder.street || "123 Đường Tạm",
                },
            ];
            await user.save();
            updatedCount++;
        }
    }
    console.log(`Successfully migrated addresses for ${updatedCount} users.`);
    process.exit(0);
}
run().catch(console.error);
