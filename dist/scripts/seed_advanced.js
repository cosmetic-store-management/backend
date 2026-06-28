import mongoose from "mongoose";
import dotenv from "dotenv";
import { fakerVI as faker } from "@faker-js/faker";
import bcrypt from "bcryptjs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../.env") });
import User from "../app/models/user/user.schema.js";
import Product from "../app/models/product/product.schema.js";
import Variant from "../app/models/product/variant.schema.js";
import Order from "../app/models/order/order.schema.js";
import PaymentTransaction from "../app/models/order/payment-transaction.schema.js";
import PointHistory from "../app/models/user/point-history.schema.js";
import InventoryTransaction from "../app/models/inventory/inventory-transaction.schema.js";
import GoodsReceipt from "../app/models/inventory/goods-receipt.schema.js";
import Supplier from "../app/models/inventory/supplier.schema.js";
import Review from "../app/models/user/review.schema.js";
import Voucher from "../app/models/system/voucher.schema.js";
import AuditLog from "../app/models/system/audit-log.schema.js";
const MAX_STOCK = 500;
const LOW_STOCK_THRESHOLD = 50;
const TOTAL_CUSTOMERS = 2400;
const DAYS_TO_SIMULATE = 365;
const runSeeder = async () => {
    try {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri)
            throw new Error("MONGODB_URI is missing");
        await mongoose.connect(mongoUri);
        console.log("✅ Connected to MongoDB");
        // 1. Dọn dẹp dữ liệu cũ (Clean Data)
        console.log("🧹 Đang dọn dẹp dữ liệu vận hành cũ...");
        await Order.deleteMany({});
        await PaymentTransaction.deleteMany({});
        await PointHistory.deleteMany({});
        await InventoryTransaction.deleteMany({});
        await GoodsReceipt.deleteMany({});
        await Review.deleteMany({});
        await Voucher.deleteMany({});
        await AuditLog.deleteMany({});
        await Supplier.deleteMany({});
        // Delete non-admin users
        await User.deleteMany({ role: "customer" });
        // Also delete any previously seeded staff/managers
        await User.deleteMany({ role: { $in: ["manager", "staff"] } });
        // Cập nhật stock về 0 để mô phỏng từ đầu
        await Variant.updateMany({}, { $set: { stock: 0 } });
        await Product.updateMany({}, { $set: { soldCount: 0, viewCount: 0, averageRating: 0, numReviews: 0 } });
        // 2. Tạo Staff/Manager/Owner (Nội bộ)
        console.log("👥 Thiết lập cơ cấu nhân sự...");
        const passwordHash = await bcrypt.hash("123456", 10);
        const existingOwner = await User.findOne({ role: "owner" });
        const ownerId = existingOwner ? existingOwner._id : new mongoose.Types.ObjectId();
        if (!existingOwner) {
            await User.create({ _id: ownerId, name: "Chủ Cửa Hàng", email: "owner@shop.com", password: passwordHash, role: "owner" });
        }
        const managers = [];
        for (let i = 1; i <= 2; i++) {
            const mgr = await User.create({ name: `Manager ${i}`, email: `manager${i}@shop.com`, password: passwordHash, role: "manager" });
            managers.push(mgr._id);
        }
        const staffs = [];
        for (let i = 1; i <= 5; i++) {
            const stf = await User.create({ name: `Staff ${i}`, email: `staff${i}@shop.com`, password: passwordHash, role: "staff" });
            staffs.push(stf._id);
        }
        // 3. Tạo Suppliers
        const supplierIds = [];
        for (let i = 1; i <= 3; i++) {
            const sup = await Supplier.create({ name: `Nhà Cung Cấp ${i}`, email: `contact@supplier${i}.com`, phone: `090000000${i}`, address: "Khu Công Nghiệp X", status: "active" });
            supplierIds.push(sup._id);
        }
        // 4. Tạo 2400 Khách hàng ảo (Customers) đăng ký rải rác
        console.log(`👤 Tạo ${TOTAL_CUSTOMERS} khách hàng mô phỏng 1 năm...`);
        const customers = [];
        const END_DATE = new Date().getTime();
        const START_DATE = END_DATE - (DAYS_TO_SIMULATE * 24 * 60 * 60 * 1000);
        for (let i = 0; i < TOTAL_CUSTOMERS; i++) {
            const regDate = new Date(START_DATE + Math.random() * (END_DATE - START_DATE));
            customers.push({
                _id: new mongoose.Types.ObjectId(),
                name: faker.person.fullName(),
                email: `customer${i}_${faker.internet.email().toLowerCase()}`,
                phone: `09${Math.floor(10000000 + Math.random() * 90000000)}`,
                password: passwordHash,
                role: "customer",
                isActive: true,
                points: 0,
                createdAt: regDate,
                updatedAt: regDate
            });
        }
        // Sắp xếp theo ngày đăng ký để dễ query in-memory
        customers.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        await User.insertMany(customers);
        // 5. Chuẩn bị In-Memory Storage
        const products = await Product.find({ isActive: true }).lean();
        const variants = await Variant.find({ isActive: true }).lean();
        if (variants.length === 0)
            throw new Error("Không có Biến thể sản phẩm nào.");
        const variantStockMap = new Map();
        const productSoldCountMap = new Map();
        variants.forEach(v => variantStockMap.set(v._id.toString(), 0));
        // Arrays to hold generated data
        const ordersToInsert = [];
        const paymentTxsToInsert = [];
        const pointHistoriesToInsert = [];
        const inventoryTxsToInsert = [];
        const goodsReceiptsToInsert = [];
        const reviewsToInsert = [];
        const vouchersToInsert = [];
        const userPointsMap = new Map();
        const userProductReviewMap = new Set();
        let orderCounter = 10000;
        let grCounter = 1000;
        console.log("⏳ KÍCH HOẠT CỖ MÁY THỜI GIAN (365 Ngày Mô phỏng)...");
        for (let day = 0; day <= DAYS_TO_SIMULATE; day++) {
            const currentDate = new Date(START_DATE + day * 24 * 60 * 60 * 1000);
            const isHighSeason = (currentDate.getMonth() === 1 && currentDate.getDate() === 14) || // 14/2
                (currentDate.getMonth() === 2 && currentDate.getDate() === 8) || // 8/3
                (currentDate.getMonth() === 9 && currentDate.getDate() === 20) || // 20/10
                (currentDate.getMonth() === 10 && currentDate.getDate() > 20) || // Black Friday
                (currentDate.getMonth() === 11); // Tháng 12
            // A. Quản trị Kho (Nhập hàng nếu dưới 50)
            for (const v of variants) {
                const vId = v._id.toString();
                let currentStock = variantStockMap.get(vId) || 0;
                if (currentStock < LOW_STOCK_THRESHOLD) {
                    const restockQty = Math.floor(Math.random() * 150) + 50; // 50 to 200
                    const finalQty = Math.min(restockQty, MAX_STOCK - currentStock);
                    if (finalQty > 0) {
                        const grId = new mongoose.Types.ObjectId();
                        const managerId = faker.helpers.arrayElement(managers);
                        const supId = faker.helpers.arrayElement(supplierIds);
                        // Cập nhật tồn kho in-memory
                        variantStockMap.set(vId, currentStock + finalQty);
                        goodsReceiptsToInsert.push({
                            _id: grId,
                            code: `GR${++grCounter}`,
                            supplierId: supId,
                            items: [{
                                    productId: v.productId,
                                    productName: products.find((p) => p._id.toString() === v.productId.toString())?.name || "Sản phẩm",
                                    variantId: v._id,
                                    variantName: v.name || "Mặc định",
                                    quantity: finalQty,
                                    importPrice: Math.floor(v.price * 0.6) // Giá nhập = 60% giá bán
                                }],
                            totalAmount: Math.floor(v.price * 0.6) * finalQty,
                            note: "Nhập tự động qua mô phỏng",
                            creatorId: managerId,
                            createdAt: currentDate,
                            updatedAt: currentDate
                        });
                        inventoryTxsToInsert.push({
                            code: `TX-IN-${grCounter}-${vId.substring(18)}`,
                            productId: v.productId,
                            variantId: v._id,
                            type: "in",
                            qty: finalQty,
                            creatorId: managerId,
                            reference: grId,
                            referenceModel: "GoodsReceipt",
                            date: currentDate,
                            createdAt: currentDate
                        });
                    }
                }
            }
            // B. Quản trị Voucher (Mùng 1 hàng tháng)
            if (currentDate.getDate() === 1) {
                vouchersToInsert.push({
                    code: `SALE${currentDate.getMonth() + 1}${currentDate.getFullYear()}`,
                    discountType: "percent",
                    discountValue: 10,
                    minOrderValue: 200000,
                    maxDiscount: 50000,
                    startDate: currentDate,
                    endDate: new Date(currentDate.getTime() + 10 * 24 * 60 * 60 * 1000), // 10 days
                    usageLimit: 100,
                    usedCount: 0,
                    isActive: true,
                    createdAt: currentDate
                });
            }
            // Lấy danh sách khách hàng ĐÃ đăng ký tính đến hôm nay
            const eligibleCustomers = customers.filter(c => c.createdAt <= currentDate);
            if (eligibleCustomers.length === 0)
                continue;
            // Số lượng đơn hàng hôm nay
            let numOrders = Math.floor(Math.random() * 20) + 10; // 10 - 30 đơn
            if (isHighSeason)
                numOrders = Math.floor(numOrders * 2.5); // X2.5 vào mùa cao điểm
            // C. Bán hàng
            for (let o = 0; o < numOrders; o++) {
                const customer = faker.helpers.arrayElement(eligibleCustomers);
                const numItems = Math.floor(Math.random() * 3) + 1;
                const items = [];
                let totalAmount = 0;
                const selectedVariants = faker.helpers.arrayElements(variants, numItems);
                let canFulfill = true;
                for (const v of selectedVariants) {
                    const qty = Math.floor(Math.random() * 2) + 1;
                    const stock = variantStockMap.get(v._id.toString());
                    if (stock < qty) {
                        canFulfill = false;
                        break;
                    }
                    items.push({
                        productId: v.productId,
                        productName: products.find((p) => p._id.toString() === v.productId.toString())?.name || "Product",
                        variantId: v._id,
                        variantName: v.name || "Mặc định",
                        quantity: qty,
                        price: v.price,
                        lineTotal: v.price * qty
                    });
                    totalAmount += v.price * qty;
                }
                if (!canFulfill || items.length === 0)
                    continue; // Bỏ qua nếu không đủ kho
                // Trừ kho ngay lập tức in-memory
                items.forEach(item => {
                    const vId = item.variantId.toString();
                    variantStockMap.set(vId, variantStockMap.get(vId) - item.quantity);
                    productSoldCountMap.set(item.productId.toString(), (productSoldCountMap.get(item.productId.toString()) || 0) + item.quantity);
                });
                const orderId = new mongoose.Types.ObjectId();
                const code = `ORD${++orderCounter}`;
                const isPOS = Math.random() < 0.3; // 30% Offline POS
                const statusRand = Math.random();
                let orderStatus = "completed"; // Default 85% success
                if (statusRand > 0.85 && statusRand <= 0.95)
                    orderStatus = "cancelled"; // 10% Cancelled
                else if (statusRand > 0.95)
                    orderStatus = "returned"; // 5% Returned
                const staffId = faker.helpers.arrayElement(staffs);
                // Tạo Đơn hàng
                ordersToInsert.push({
                    _id: orderId,
                    code,
                    userId: customer._id,
                    items,
                    subtotal: totalAmount,
                    totalAmount: totalAmount, // Không tính voucher cho mô phỏng đơn giản
                    discountAmount: 0,
                    orderStatus: orderStatus,
                    paymentMethod: isPOS ? "cash" : "transfer",
                    paymentStatus: orderStatus === "cancelled" ? "failed" : "paid",
                    receiverName: customer.name,
                    phone: customer.phone,
                    province: "TP HCM",
                    district: "Quận 1",
                    ward: "Phường Bến Nghé",
                    street: "Đường ABC",
                    channel: isPOS ? "pos" : "online",
                    createdAt: currentDate,
                    updatedAt: currentDate
                });
                // Tạo Transaction Kho (Loại OUT)
                items.forEach((item, idx) => {
                    inventoryTxsToInsert.push({
                        code: `TX-OUT-${orderCounter}-${idx}`,
                        productId: item.productId,
                        variantId: item.variantId,
                        type: "out",
                        qty: item.quantity,
                        creatorId: staffId,
                        reference: orderId,
                        referenceModel: "Order",
                        date: currentDate,
                        createdAt: currentDate
                    });
                });
                // Tạo Payment
                if (orderStatus !== "cancelled") {
                    paymentTxsToInsert.push({
                        orderId,
                        amount: totalAmount,
                        paymentMethod: isPOS ? "cash" : "transfer",
                        status: "success",
                        providerTransactionId: `TX-${Math.floor(100000 + Math.random() * 900000)}`,
                        createdAt: currentDate
                    });
                }
                // Tạo Lịch sử điểm (Chỉ cộng nếu Completed, trừ nếu Returned)
                if (orderStatus === "completed" || orderStatus === "returned") {
                    const pointsEarned = Math.floor(totalAmount * 0.01);
                    if (pointsEarned > 0) {
                        const isReturn = orderStatus === "returned";
                        const p = isReturn ? -pointsEarned : pointsEarned;
                        userPointsMap.set(customer._id.toString(), (userPointsMap.get(customer._id.toString()) || 0) + p);
                        pointHistoriesToInsert.push({
                            userId: customer._id,
                            pointsChanged: p,
                            performedBy: staffId,
                            reason: isReturn ? `Thu hồi điểm đơn #${code}` : `Tích luỹ mua hàng #${code}`,
                            createdAt: currentDate
                        });
                        // Nếu Returned, CỘNG LẠI KHO in-memory (Manager xử lý)
                        if (isReturn) {
                            const managerId = faker.helpers.arrayElement(managers);
                            items.forEach((item, idx) => {
                                const vId = item.variantId.toString();
                                variantStockMap.set(vId, variantStockMap.get(vId) + item.quantity); // Trả lại kho
                                productSoldCountMap.set(item.productId.toString(), productSoldCountMap.get(item.productId.toString()) - item.quantity);
                                inventoryTxsToInsert.push({
                                    code: `TX-RET-${orderCounter}-${idx}`,
                                    productId: item.productId,
                                    variantId: item.variantId,
                                    type: "in", // Nhập lại
                                    qty: item.quantity,
                                    creatorId: managerId,
                                    reference: orderId,
                                    referenceModel: "Order",
                                    date: currentDate,
                                    createdAt: currentDate
                                });
                            });
                        }
                    }
                }
                // Tạo Review (20% cho đơn Completed)
                if (orderStatus === "completed" && Math.random() < 0.2) {
                    const reviewKey = `${customer._id.toString()}_${items[0].productId.toString()}`;
                    if (!userProductReviewMap.has(reviewKey)) {
                        userProductReviewMap.add(reviewKey);
                        const reviewDate = new Date(currentDate.getTime() + 2 * 24 * 60 * 60 * 1000); // 2 days later
                        reviewsToInsert.push({
                            productId: items[0].productId,
                            userId: customer._id,
                            orderId: orderId,
                            rating: faker.number.int({ min: 4, max: 5 }),
                            comment: faker.helpers.arrayElement(["Rất tuyệt", "Sẽ ủng hộ lại", "Hàng đóng gói cẩn thận", "Nhân viên nhiệt tình"]),
                            status: "approved",
                            createdAt: reviewDate
                        });
                    }
                }
            }
        }
        // 6. BULK INSERT VÀO DATABASE
        console.log(`🚀 Chèn ${goodsReceiptsToInsert.length} phiếu nhập, ${inventoryTxsToInsert.length} lịch sử kho...`);
        await bulkInsertSafely(GoodsReceipt, goodsReceiptsToInsert);
        await bulkInsertSafely(InventoryTransaction, inventoryTxsToInsert);
        console.log(`🚀 Chèn ${ordersToInsert.length} Đơn hàng, ${paymentTxsToInsert.length} Thanh toán...`);
        await bulkInsertSafely(Order, ordersToInsert);
        await bulkInsertSafely(PaymentTransaction, paymentTxsToInsert);
        console.log(`🚀 Chèn ${pointHistoriesToInsert.length} Lịch sử điểm, ${reviewsToInsert.length} Đánh giá...`);
        await bulkInsertSafely(PointHistory, pointHistoriesToInsert);
        await bulkInsertSafely(Review, reviewsToInsert);
        await Voucher.insertMany(vouchersToInsert);
        // 7. CẬP NHẬT TỒN KHO & ĐIỂM
        console.log("🔄 Cập nhật tồn kho cuối kỳ và điểm khách hàng...");
        const variantOps = [];
        for (const [vId, stock] of variantStockMap.entries()) {
            variantOps.push({ updateOne: { filter: { _id: vId }, update: { $set: { stock } } } });
        }
        if (variantOps.length > 0)
            await Variant.bulkWrite(variantOps);
        const productOps = [];
        for (const [pId, soldCount] of productSoldCountMap.entries()) {
            productOps.push({ updateOne: { filter: { _id: pId }, update: { $set: { soldCount } } } });
        }
        if (productOps.length > 0)
            await Product.bulkWrite(productOps);
        const userOps = [];
        for (const [uId, points] of userPointsMap.entries()) {
            userOps.push({ updateOne: { filter: { _id: uId }, update: { $set: { points } } } });
        }
        if (userOps.length > 0)
            await User.bulkWrite(userOps);
        console.log("✅ HOÀN TẤT MÔ PHỎNG 1 NĂM VẬN HÀNH THÀNH CÔNG!");
        process.exit(0);
    }
    catch (error) {
        console.error("❌ Lỗi Seeding:", error);
        process.exit(1);
    }
};
async function bulkInsertSafely(Model, data) {
    const CHUNK = 2000;
    for (let i = 0; i < data.length; i += CHUNK) {
        await Model.insertMany(data.slice(i, i + CHUNK));
    }
}
runSeeder();
