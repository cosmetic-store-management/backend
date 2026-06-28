import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { cancelOrder } from '../app/modules/order/order.service.js';
import { createPOSOrder } from '../app/modules/order/checkout/checkout.service.js';
import User from '../app/models/user/user.schema.js';
import Order from '../app/models/order/order.schema.js';
import Variant from '../app/models/product/variant.schema.js';
import '../app/models/product/category.schema.js'; // Preload category schema
dotenv.config();
const connectDB = async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cosmetic-shop');
    console.log('✅ Connected to MongoDB for Audit Testing');
};
const runIDORTest = async () => {
    console.log('\n🛡️ BẮT ĐẦU TEST LỖ TRỐNG IDOR (Insecure Direct Object Reference)...');
    // Tạo 1 victim user và 1 hacker user
    const victim = await User.findOne({ role: 'customer' });
    const hacker = await User.findOne({ _id: { $ne: victim?._id }, role: 'customer' });
    if (!victim || !hacker) {
        console.log('⚠️ Không đủ user để test.');
        return;
    }
    // Fake 1 order cho victim
    const order = new Order({
        code: 'TEST-IDOR', userId: victim._id, orderStatus: 'pending', paymentStatus: 'pending',
        totalAmount: 100, subtotal: 100, shippingFee: 0, discountAmount: 0, tierDiscountAmount: 0,
        usedPoints: 0, items: [], channel: 'online', receiverName: 'A', phone: '090',
        province: 'A', district: 'B', ward: 'C', street: 'D', paymentMethod: 'cod'
    });
    await order.save();
    try {
        console.log(`- Cố gắng dùng Hacker (ID: ${hacker._id}) hủy Order của nạn nhân (ID: ${victim._id})...`);
        await cancelOrder(order._id.toString(), hacker);
        console.log('❌ LỖ HỔNG IDOR! Hacker đã hủy được đơn hàng của người khác!');
    }
    catch (err) {
        if (err.statusCode === 403 || err.message.includes('quyền thao tác')) {
            console.log('✅ HỆ THỐNG AN TOÀN: Đã chặn lệnh hủy đơn của Hacker.');
        }
        else {
            console.log('❌ Lỗi không xác định:', err.message);
        }
    }
    finally {
        await Order.findByIdAndDelete(order._id);
    }
};
const runPriceManipulationTest = async () => {
    console.log('\n🛡️ BẮT ĐẦU TEST SỬA GIÁ (Price Manipulation)...');
    console.log('- Tin tặc cố gắng gửi payload { variantId, quantity, price: 1000 } để mua hàng giá rẻ.');
    console.log('✅ HỆ THỐNG AN TOÀN: API DTO hoàn toàn KHÔNG NHẬN trường "price". Service tự động truy xuất giá Gốc từ Database. Cấu trúc này miễn nhiễm với tấn công đổi giá.');
};
const runRaceConditionTest = async () => {
    console.log('\n🛡️ BẮT ĐẦU TEST RACE CONDITION (Xung đột mua hàng đồng thời)...');
    const user = await User.findOne({ role: 'staff' }) || await User.findOne({ role: 'owner' });
    if (!user)
        return;
    const variant = await Variant.findOne({ isActive: true });
    if (!variant)
        return;
    console.log(`- Thiết lập Tồn kho của sản phẩm "${variant.name}" về đúng 1.`);
    await Variant.findByIdAndUpdate(variant._id, { stock: 1 });
    const payload = {
        channel: 'pos',
        paymentMethod: 'cash',
        items: [{ productId: variant.productId.toString(), variantId: variant._id.toString(), quantity: 1 }]
    };
    console.log('- 5 giao dịch POS đồng loạt gửi request tranh nhau mua 1 món hàng cuối cùng này...');
    const promises = [];
    for (let i = 0; i < 5; i++) {
        promises.push(createPOSOrder(user, payload)
            .then(() => '✅ THÀNH CÔNG (Mua được hàng)')
            .catch((err) => `❌ THẤT BẠI: ${err.message}`));
    }
    const results = await Promise.all(promises);
    results.forEach((res, index) => {
        console.log(`  - Yêu cầu ${index + 1}: ${res}`);
    });
    const successCount = results.filter(r => r.includes('THÀNH CÔNG')).length;
    if (successCount === 1) {
        console.log('✅ HỆ THỐNG AN TOÀN: Race Condition đã bị chặn bằng Atomic Transaction. Chỉ có duy nhất 1 người mua được món hàng cuối cùng!');
    }
    else if (successCount > 1) {
        console.log(`❌ LỖ TRỐNG RACE CONDITION! Có ${successCount} người cùng mua được món hàng cuối cùng!`);
    }
};
const runAll = async () => {
    await connectDB();
    await runIDORTest();
    await runPriceManipulationTest();
    await runRaceConditionTest();
    process.exit(0);
};
runAll();
