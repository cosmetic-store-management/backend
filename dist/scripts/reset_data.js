import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import User from "../app/models/user/user.schema.js";
import Order from "../app/models/order/order.schema.js";
import PaymentTransaction from "../app/models/order/payment-transaction.schema.js";
import GoodsReceipt from "../app/models/inventory/goods-receipt.schema.js";
import InventoryTransaction from "../app/models/inventory/inventory-transaction.schema.js";
import Supplier from "../app/models/inventory/supplier.schema.js";
import Review from "../app/models/user/review.schema.js";
import Voucher from "../app/models/system/voucher.schema.js";
import PointHistory from "../app/models/user/point-history.schema.js";
import AuditLog from "../app/models/system/audit-log.schema.js";
import Cart from "../app/models/cart/cart.schema.js";
import Variant from "../app/models/product/variant.schema.js";
import Product from "../app/models/product/product.schema.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../.env") });
async function resetSystem() {
    try {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            console.error("❌ MONGODB_URI is missing");
            process.exit(1);
        }
        console.log("⏳ Connecting to MongoDB...");
        await mongoose.connect(mongoUri);
        console.log("✅ Connected to MongoDB");
        // 1. Dọn dẹp dữ liệu động (Delete All)
        console.log("\n🧹 Bắt đầu xóa dữ liệu động...");
        const userDel = await User.deleteMany({ role: "customer" });
        console.log(`- Xóa ${userDel.deletedCount} Khách hàng (User).`);
        const orderDel = await Order.deleteMany({});
        console.log(`- Xóa ${orderDel.deletedCount} Đơn hàng (Order).`);
        const paymentDel = await PaymentTransaction.deleteMany({});
        console.log(`- Xóa ${paymentDel.deletedCount} Giao dịch thanh toán.`);
        const grDel = await GoodsReceipt.deleteMany({});
        console.log(`- Xóa ${grDel.deletedCount} Phiếu nhập kho (GoodsReceipt).`);
        const itDel = await InventoryTransaction.deleteMany({});
        console.log(`- Xóa ${itDel.deletedCount} Lịch sử kho (InventoryTransaction).`);
        const supDel = await Supplier.deleteMany({});
        console.log(`- Xóa ${supDel.deletedCount} Nhà cung cấp (Supplier).`);
        const revDel = await Review.deleteMany({});
        console.log(`- Xóa ${revDel.deletedCount} Đánh giá (Review).`);
        const vouchDel = await Voucher.deleteMany({});
        console.log(`- Xóa ${vouchDel.deletedCount} Mã giảm giá (Voucher).`);
        const pointDel = await PointHistory.deleteMany({});
        console.log(`- Xóa ${pointDel.deletedCount} Lịch sử điểm (PointHistory).`);
        const auditDel = await AuditLog.deleteMany({});
        console.log(`- Xóa ${auditDel.deletedCount} Nhật ký hệ thống (AuditLog).`);
        const cartDel = await Cart.deleteMany({});
        console.log(`- Xóa ${cartDel.deletedCount} Giỏ hàng (Cart).`);
        // 2. Làm sạch Master Data (Reset Stats)
        console.log("\n🔄 Bắt đầu làm sạch Sản phẩm và Kho...");
        const variantUpdate = await Variant.updateMany({}, { $set: { stock: 0 } });
        console.log(`- Reset tồn kho về 0 cho ${variantUpdate.modifiedCount} Biến thể (Variant).`);
        const productUpdate = await Product.updateMany({}, {
            $set: {
                soldCount: 0,
                viewCount: 0,
                averageRating: 0,
                numReviews: 0
            }
        });
        console.log(`- Reset chỉ số (lượt bán, lượt xem, đánh giá) cho ${productUpdate.modifiedCount} Sản phẩm.`);
        console.log("\n🎉 Dọn dẹp hệ thống hoàn tất! (Sẵn sàng Release)");
        process.exit(0);
    }
    catch (error) {
        console.error("❌ Reset Error:", error);
        process.exit(1);
    }
}
resetSystem();
