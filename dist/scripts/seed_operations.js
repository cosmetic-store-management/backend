import mongoose from "mongoose";
import dotenv from "dotenv";
import { fakerVI as faker } from "@faker-js/faker";
import bcrypt from "bcryptjs";
dotenv.config();
import User from "../app/models/user/user.schema.js";
import Product from "../app/models/product/product.schema.js";
import Variant from "../app/models/product/variant.schema.js";
import Order from "../app/models/order/order.schema.js";
import PaymentTransaction from "../app/models/order/payment-transaction.schema.js";
import PointHistory from "../app/models/user/point-history.schema.js";
import InventoryTransaction from "../app/models/inventory/inventory-transaction.schema.js";
import Review from "../app/models/user/review.schema.js";
const runSeeder = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/cosmetic-shop");
        console.log("Connected to MongoDB");
        console.log("1. Cleaning old operational data...");
        await Order.deleteMany({});
        await PaymentTransaction.deleteMany({});
        await PointHistory.deleteMany({});
        await InventoryTransaction.deleteMany({});
        await Review.deleteMany({});
        await User.deleteMany({ role: "customer" });
        console.log("2. Restoring massive stock to prevent depletion...");
        await Variant.updateMany({}, { $set: { stock: 50000, isActive: true } });
        await Product.updateMany({}, { $set: { soldCount: 0, isActive: true } });
        console.log("3. Creating 1000 Users...");
        const users = [];
        const passwordHash = await bcrypt.hash("123456", 10);
        for (let i = 0; i < 1000; i++) {
            const email = `customer${i}_${faker.internet.email().toLowerCase()}`;
            const phone = `09${Math.floor(10000000 + Math.random() * 90000000)}`;
            users.push({
                name: faker.person.fullName(),
                email: email,
                phone: phone,
                password: passwordHash,
                role: "customer",
                isActive: true,
                points: 0,
                createdAt: faker.date.between({ from: "2024-06-01", to: "2026-06-01" })
            });
        }
        const insertedUsers = await User.insertMany(users);
        console.log(`=> Created ${insertedUsers.length} users`);
        console.log("4. Fetching Products & Variants...");
        const products = await Product.find({ isActive: true }).lean();
        const productMap = new Map(products.map(p => [p._id.toString(), p]));
        const productIds = Array.from(productMap.keys());
        const variants = await Variant.find({ isActive: true, productId: { $in: productIds } }).lean();
        if (variants.length === 0)
            throw new Error("No variants found in DB.");
        console.log("5. Generating 10,000 Orders (In-Memory Processing)...");
        const admin = await User.findOne({ role: "admin" });
        const adminId = admin ? admin._id : new mongoose.Types.ObjectId();
        const START_DATE = new Date("2024-06-01").getTime();
        const END_DATE = new Date("2026-06-01").getTime();
        const orderDates = Array.from({ length: 10000 }).map(() => new Date(START_DATE + Math.random() * (END_DATE - START_DATE))).sort((a, b) => a.getTime() - b.getTime());
        const ordersToInsert = [];
        const paymentTxsToInsert = [];
        const pointHistoriesToInsert = [];
        const inventoryTxsToInsert = [];
        const reviewsToInsert = [];
        const productSoldCountMap = new Map();
        const userPointsMap = new Map();
        const userProductReviewMap = new Set();
        let codeCounter = 10000;
        for (let i = 0; i < orderDates.length; i++) {
            const orderDate = orderDates[i];
            const isPOS = Math.random() > 0.5;
            const user = faker.helpers.arrayElement(insertedUsers);
            const itemCount = faker.number.int({ min: 1, max: 4 });
            const items = [];
            const usedVariantIds = new Set();
            let totalAmount = 0;
            let totalDiscount = 0;
            for (let j = 0; j < itemCount; j++) {
                const variant = faker.helpers.arrayElement(variants);
                if (usedVariantIds.has(variant._id.toString()))
                    continue;
                usedVariantIds.add(variant._id.toString());
                const product = productMap.get(variant.productId.toString());
                const qty = faker.number.int({ min: 1, max: 3 });
                const price = variant.price;
                const subtotal = price * qty;
                totalAmount += subtotal;
                items.push({
                    productId: variant.productId,
                    productName: product ? product.name : "Sản phẩm",
                    variantId: variant._id,
                    variantName: variant.name || "Mặc định",
                    quantity: qty,
                    price: price,
                    lineTotal: subtotal,
                });
            }
            if (items.length === 0)
                continue;
            const orderId = new mongoose.Types.ObjectId();
            const code = `ORD${++codeCounter}`;
            if (isPOS) {
                // POS Order logic
                const discountAmount = 0;
                const finalAmount = totalAmount - discountAmount;
                ordersToInsert.push({
                    _id: orderId,
                    code,
                    userId: user._id,
                    items,
                    subtotal: totalAmount,
                    totalAmount: totalAmount,
                    discountAmount,
                    orderStatus: "completed",
                    paymentMethod: "cash",
                    paymentStatus: "paid",
                    receiverName: user.name,
                    phone: user.phone,
                    province: "TP HCM",
                    district: "Quận 1",
                    ward: "Phường Bến Nghé",
                    street: "Mua tại cửa hàng",
                    note: "Khách mua trực tiếp",
                    channel: "pos",
                    createdAt: orderDate,
                    updatedAt: orderDate,
                });
                paymentTxsToInsert.push({
                    orderId,
                    amount: finalAmount,
                    paymentMethod: "cash",
                    status: "success",
                    providerTransactionId: `TX-POS-${Math.floor(100000 + Math.random() * 900000)}`,
                    createdAt: orderDate,
                });
                // Earn Points
                const pointsEarned = Math.floor(finalAmount * 0.01); // 1% points
                if (pointsEarned > 0) {
                    userPointsMap.set(user._id.toString(), (userPointsMap.get(user._id.toString()) || 0) + pointsEarned);
                    pointHistoriesToInsert.push({
                        userId: user._id,
                        pointsChanged: pointsEarned,
                        performedBy: adminId,
                        reason: `Tích luỹ mua hàng #${code}`,
                        createdAt: orderDate,
                    });
                }
            }
            else {
                // Online Order logic
                const statusRand = Math.random();
                let orderStatus = "pending";
                let paymentStatus = "pending";
                if (statusRand < 0.85) {
                    orderStatus = "completed";
                    paymentStatus = "paid";
                }
                else if (statusRand < 0.95) {
                    orderStatus = "cancelled";
                }
                const paymentMethod = faker.helpers.arrayElement(["cod", "transfer", "stripe"]);
                ordersToInsert.push({
                    _id: orderId,
                    code,
                    userId: user._id,
                    items,
                    subtotal: totalAmount,
                    totalAmount: totalAmount,
                    discountAmount: 0,
                    orderStatus,
                    paymentMethod,
                    paymentStatus,
                    receiverName: user.name,
                    phone: user.phone,
                    province: faker.location.state(),
                    district: faker.location.city(),
                    ward: faker.location.streetAddress(),
                    street: faker.location.streetAddress(),
                    note: "",
                    channel: "online",
                    createdAt: orderDate,
                    updatedAt: orderDate,
                });
                if (paymentStatus === "paid") {
                    paymentTxsToInsert.push({
                        orderId,
                        amount: totalAmount,
                        paymentMethod: paymentMethod === "cod" ? "cod" : paymentMethod,
                        status: "success",
                        providerTransactionId: `TX-ONL-${Math.floor(100000 + Math.random() * 900000)}`,
                        createdAt: orderDate,
                    });
                    const pointsEarned = Math.floor(totalAmount * 0.01);
                    if (pointsEarned > 0) {
                        userPointsMap.set(user._id.toString(), (userPointsMap.get(user._id.toString()) || 0) + pointsEarned);
                        pointHistoriesToInsert.push({
                            userId: user._id,
                            pointsChanged: pointsEarned,
                            performedBy: adminId,
                            reason: `Tích luỹ mua hàng #${code}`,
                            createdAt: orderDate,
                        });
                    }
                    // Generate Review
                    if (Math.random() < 0.4) {
                        const reviewKey = `${user._id.toString()}_${items[0].productId.toString()}`;
                        if (!userProductReviewMap.has(reviewKey)) {
                            userProductReviewMap.add(reviewKey);
                            reviewsToInsert.push({
                                productId: items[0].productId,
                                userId: user._id,
                                orderId: orderId,
                                rating: faker.number.int({ min: 4, max: 5 }),
                                comment: faker.helpers.arrayElement([
                                    "Sản phẩm rất tốt, đóng gói cẩn thận.",
                                    "Dùng ok, sẽ ủng hộ shop tiếp.",
                                    "Giao hàng nhanh, tư vấn nhiệt tình.",
                                    "Màu lên đẹp chuẩn, đúng như mô tả.",
                                    "Mùi thơm dịu nhẹ, rất thích."
                                ]),
                                images: [],
                                status: "approved",
                                createdAt: orderDate,
                            });
                        }
                    }
                }
            }
            // Inventory & Product Sold Count
            let itemIdx = 0;
            for (const item of items) {
                inventoryTxsToInsert.push({
                    code: `TX-INV-${i}-${itemIdx}-${Math.floor(10000 + Math.random() * 90000)}`,
                    productId: item.productId,
                    variantId: item.variantId,
                    type: "out",
                    qty: item.quantity,
                    creatorId: adminId,
                    date: orderDate,
                    createdAt: orderDate,
                });
                const pid = item.productId.toString();
                productSoldCountMap.set(pid, (productSoldCountMap.get(pid) || 0) + item.quantity);
                itemIdx++;
            }
        }
        console.log(`6. Executing Bulk Database Inserts for ${ordersToInsert.length} Orders...`);
        const CHUNK_SIZE = 1000;
        for (let i = 0; i < ordersToInsert.length; i += CHUNK_SIZE) {
            await Order.insertMany(ordersToInsert.slice(i, i + CHUNK_SIZE));
            await PaymentTransaction.insertMany(paymentTxsToInsert.slice(i, i + CHUNK_SIZE));
            await PointHistory.insertMany(pointHistoriesToInsert.slice(i, i + CHUNK_SIZE));
            await InventoryTransaction.insertMany(inventoryTxsToInsert.slice(i, i + CHUNK_SIZE));
            await Review.insertMany(reviewsToInsert.slice(i, i + CHUNK_SIZE));
            console.log(`... Inserted batch ${i + CHUNK_SIZE}/${ordersToInsert.length}`);
        }
        console.log("7. Updating Aggregated Data (Points & SoldCounts)...");
        // Update Users Points
        const userBulkOps = [];
        for (const [userId, points] of userPointsMap.entries()) {
            userBulkOps.push({
                updateOne: {
                    filter: { _id: userId },
                    update: { $set: { points } }
                }
            });
        }
        if (userBulkOps.length > 0)
            await User.bulkWrite(userBulkOps);
        // Update Products SoldCount
        const productBulkOps = [];
        for (const [productId, soldCount] of productSoldCountMap.entries()) {
            productBulkOps.push({
                updateOne: {
                    filter: { _id: productId },
                    update: { $inc: { soldCount } }
                }
            });
        }
        if (productBulkOps.length > 0)
            await Product.bulkWrite(productBulkOps);
        console.log("✅ MASSIVE SEEDING COMPLETED SUCCESSFULLY!");
        process.exit(0);
    }
    catch (error) {
        console.error("Seeding failed:", error);
        process.exit(1);
    }
};
runSeeder();
