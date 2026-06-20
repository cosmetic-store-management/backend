import mongoose from "mongoose";
import Order from "../../models/order.schema.js";
import User from "../../models/user.schema.js";
import Product from "../../models/product.schema.js";
import PointHistory from "../../models/point-history.schema.js";
import InventoryTransaction from "../../models/inventory-transaction.schema.js";
import * as orderRepo from "./order.repository.js";
import { mapOrder } from "./dto/order.response.dto.js";
import { badRequest, notFound } from "../../shared/errors/httpErrors.js";
import { validateVoucher, incrementVoucherUsage } from "../voucher/voucher.service.js";
import { POINTS_EARN_RATE, MAX_POINTS_PCT, DEFAULT_ITEM_WEIGHT_G, generateOrderCode, calculateTierDiscount } from "./order.helper.js";
import { calcShippingFeeFromSettings } from "./order.shipping.js";
import { sendOrderSuccessEmail } from "../../shared/email/email.service.js";
export const getUserTotalSpent = async (userId) => {
    const [result] = await Order.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId.toString()), orderStatus: "completed" } },
        { $group: { _id: null, totalSpent: { $sum: "$totalAmount" } } },
    ]);
    return result?.totalSpent ?? 0;
};
export const previewOrder = async (user, data) => {
    let subtotal = 0;
    let totalWeight = 0;
    const previewItems = [];
    for (const item of data.items) {
        if (!mongoose.Types.ObjectId.isValid(item.productId))
            throw badRequest("productId không hợp lệ");
        if (!item.variantId || !mongoose.Types.ObjectId.isValid(item.variantId))
            throw badRequest("variantId không hợp lệ");
        const variant = await orderRepo.findVariantById(item.variantId);
        if (!variant || variant.productId.toString() !== item.productId)
            throw notFound("Phân loại hàng không hợp lệ");
        if (!variant.isActive)
            throw badRequest(`Phân loại ${variant.name} hiện không khả dụng`);
        const unitPrice = variant.discountPrice && variant.discountPrice > 0 ? variant.discountPrice : variant.price;
        const lineTotal = unitPrice * item.quantity;
        subtotal += lineTotal;
        totalWeight += (variant.weight || 200) * item.quantity;
        // Collect per-item pricing from DB (source of truth, not cart cache)
        previewItems.push({
            variantId: item.variantId,
            productId: item.productId,
            unitPrice,
            quantity: item.quantity,
            lineTotal,
        });
    }
    // Phí ship — đọc từ Settings (standardShippingFee, freeShippingThreshold)
    const shippingFee = await calcShippingFeeFromSettings(subtotal, totalWeight, data.province || "", data.channel || "online");
    // Khách hàng cho POS
    let customerUser = user;
    if (data.channel === "pos" && data.customerPhone) {
        customerUser = await User.findOne({ phone: data.customerPhone.trim(), role: "customer" });
    }
    // 1. Áp dụng giảm giá Hạng thành viên (dựa trên tổng chi tiêu lịch sử)
    const userTotalSpent = customerUser?.role === "customer" && customerUser._id
        ? await getUserTotalSpent(customerUser._id)
        : 0;
    const tierDiscountAmount = customerUser?.role === "customer" ? calculateTierDiscount(userTotalSpent, subtotal) : 0;
    // 2. Áp dụng Voucher (hoặc manual discount ở POS)
    let voucherDiscountAmount = 0;
    let finalVoucherCode = "";
    if (data.channel === "pos" && typeof data.discountAmount === "number") {
        voucherDiscountAmount = data.discountAmount; // POS dùng manual discount
    }
    else if (data.voucherCode) {
        try {
            const voucherRes = await validateVoucher(data.voucherCode, subtotal, shippingFee, user?._id.toString());
            voucherDiscountAmount = voucherRes.discountAmount;
            finalVoucherCode = voucherRes.voucherCode;
        }
        catch (error) {
            // Bỏ qua lỗi voucher khi preview để không chặn người dùng gõ
        }
    }
    // Tổng giảm giá trước khi dùng điểm
    const totalDiscount = Math.min(tierDiscountAmount + voucherDiscountAmount, subtotal + shippingFee);
    const totalAmountBeforePoints = Math.max(0, subtotal + shippingFee - totalDiscount);
    // 3. Xử lý dùng điểm (Tối đa 50% đơn)
    const userPoints = customerUser?.points || 0;
    const requestedUsedPoints = typeof data.usedPoints === "number" && data.usedPoints > 0 ? data.usedPoints : 0;
    const maxPointsAllowed = Math.floor(totalAmountBeforePoints * MAX_POINTS_PCT);
    const actualUsedPoints = Math.min(requestedUsedPoints, userPoints, maxPointsAllowed);
    const finalTotalAmount = Math.max(0, totalAmountBeforePoints - actualUsedPoints);
    return {
        items: previewItems, // ← per-item prices từ DB
        subtotal,
        shippingFee,
        tierDiscountAmount,
        voucherDiscountAmount,
        finalVoucherCode,
        totalDiscount,
        userPoints,
        maxPointsAllowed,
        actualUsedPoints,
        finalTotalAmount,
    };
};
export const createOrder = async (user, data) => {
    if (!data.items || data.items.length === 0)
        throw badRequest("Giỏ hàng rỗng");
    // Ngăn chặn Double Submit (Double Charge) bằng Idempotency Key
    if (data.idempotencyKey) {
        const existingOrder = await Order.findOne({ idempotencyKey: data.idempotencyKey, userId: user._id });
        if (existingOrder) {
            // Đã tạo trước đó ở luồng khác, chỉ trả về lại kết quả cũ (Idempotent response)
            const mapped = mapOrder(existingOrder, existingOrder.items || []);
            if (existingOrder.paymentMethod === "vnpay") {
                const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
                const paymentUrl = `${frontendUrl}/mock-payment/${existingOrder._id}?amount=${existingOrder.totalAmount}&code=${existingOrder.code}`;
                return { ...mapped, paymentUrl };
            }
            return mapped;
        }
    }
    const receiverName = data.receiverName.trim();
    const phone = data.phone.trim();
    const province = data.province.trim();
    const district = data.district.trim();
    const ward = data.ward.trim();
    const street = data.street.trim();
    const normalizedItems = [];
    let subtotal = 0;
    for (const item of data.items) {
        if (!mongoose.Types.ObjectId.isValid(item.productId))
            throw badRequest("productId không hợp lệ");
        if (!item.variantId || !mongoose.Types.ObjectId.isValid(item.variantId))
            throw badRequest("variantId không hợp lệ");
        const product = await orderRepo.findProductById(item.productId);
        if (!product)
            throw notFound("Có sản phẩm không tồn tại");
        if (!product.isActive)
            throw badRequest(`Sản phẩm ${product.name} hiện không khả dụng`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (product.categoryId?.isActive === false)
            throw badRequest(`Danh mục của sản phẩm ${product.name} hiện không khả dụng`);
        const variant = await orderRepo.findVariantById(item.variantId);
        if (!variant || variant.productId.toString() !== item.productId)
            throw notFound("Phân loại hàng không hợp lệ");
        if (!variant.isActive)
            throw badRequest(`Phân loại ${variant.name} của sản phẩm ${product.name} hiện không khả dụng`);
        if (variant.stock < item.quantity)
            throw badRequest(`Sản phẩm ${product.name} (${variant.name}) không đủ tồn kho`);
        const unitPrice = variant.discountPrice && variant.discountPrice > 0 ? variant.discountPrice : variant.price;
        const lineTotal = unitPrice * item.quantity;
        subtotal += lineTotal;
        normalizedItems.push({
            productId: product._id,
            variantId: variant._id,
            productName: product.name,
            variantName: variant.name,
            imageUrl: variant.imageUrl || product.imageUrl,
            price: unitPrice,
            quantity: item.quantity,
            lineTotal,
            weight: variant.weight || DEFAULT_ITEM_WEIGHT_G,
        });
    }
    // Tính tổng khối lượng để gọi hàm mock shipping fee
    const totalWeight = normalizedItems.reduce((sum, item) => sum + (item.weight || DEFAULT_ITEM_WEIGHT_G) * item.quantity, 0);
    // Phí ship — đọc từ Settings (standardShippingFee, freeShippingThreshold)
    const shippingFee = await calcShippingFeeFromSettings(subtotal, totalWeight, province, "online");
    const totalAmount = subtotal + shippingFee;
    // 1. Áp dụng giảm giá Hạng thành viên (Spending-based)
    const userTotalSpent = user.role === "customer" ? await getUserTotalSpent(user._id) : 0;
    const tierDiscountAmount = user.role === "customer" ? calculateTierDiscount(userTotalSpent, subtotal) : 0;
    // 2. Áp dụng Voucher (nếu có)
    let voucherDiscountAmount = 0;
    let finalVoucherCode = "";
    if (data.voucherCode) {
        try {
            const voucherRes = await validateVoucher(data.voucherCode, subtotal, shippingFee, user._id.toString());
            voucherDiscountAmount = voucherRes.discountAmount;
            finalVoucherCode = voucherRes.voucherCode;
        }
        catch (error) {
            throw badRequest(error.message || "Mã giảm giá không hợp lệ");
        }
    }
    // Tổng giảm giá trước khi dùng điểm
    const totalDiscount = Math.min(tierDiscountAmount + voucherDiscountAmount, subtotal + shippingFee);
    const totalAmountBeforePoints = Math.max(0, subtotal + shippingFee - totalDiscount);
    // 3. Xử lý dùng điểm (Tối đa 50% đơn)
    const userPoints = user.points || 0;
    const requestedUsedPoints = typeof data.usedPoints === "number" && data.usedPoints > 0 ? data.usedPoints : 0;
    const maxPointsAllowed = Math.floor(totalAmountBeforePoints * MAX_POINTS_PCT);
    const actualUsedPoints = Math.min(requestedUsedPoints, userPoints, maxPointsAllowed);
    const finalTotalAmount = Math.max(0, totalAmountBeforePoints - actualUsedPoints);
    // 4. Trừ tồn kho trước (Atomic Increment with conditions)
    const decrementedVariants = [];
    try {
        for (const item of normalizedItems) {
            await orderRepo.decrementVariantStock(item.variantId.toString(), item.quantity);
            decrementedVariants.push(item);
        }
    }
    catch (error) {
        // Nếu có 1 item thất bại (hết hàng do race condition), rollback các item đã trừ trước đó
        for (const item of decrementedVariants) {
            await orderRepo.incrementVariantStock(item.variantId.toString(), item.quantity);
        }
        throw badRequest(error.message || "Sản phẩm vừa hết hàng, vui lòng thử lại.");
    }
    // 5. Tạo đơn hàng và xử lý voucher/điểm (Saga Pattern)
    let newOrder;
    let orderItems;
    try {
        newOrder = await orderRepo.createOrder({
            code: generateOrderCode(),
            receiverName,
            phone,
            province,
            district,
            ward,
            street,
            orderStatus: "pending",
            paymentMethod: data.paymentMethod,
            subtotal,
            shippingFee,
            voucherCode: finalVoucherCode,
            discountAmount: totalDiscount,
            tierDiscountAmount,
            usedPoints: actualUsedPoints,
            totalAmount: finalTotalAmount,
            note: data.note,
            userId: user._id,
            channel: "online",
            creatorId: null,
            paymentStatus: "pending",
            idempotencyKey: data.idempotencyKey,
            items: normalizedItems.map(i => { const { weight, ...rest } = i; return rest; }),
        });
        orderItems = newOrder.items;
        if (finalVoucherCode) {
            await incrementVoucherUsage(finalVoucherCode, user._id.toString());
        }
        // Trừ điểm của khách nếu dùng
        if (actualUsedPoints > 0) {
            const updatedUser = await User.findOneAndUpdate({ _id: user._id, points: { $gte: actualUsedPoints } }, { $inc: { points: -actualUsedPoints } }, { returnDocument: "after" });
            if (!updatedUser) {
                throw badRequest("Điểm tích lũy không đủ hoặc đã thay đổi do giao dịch khác. Vui lòng thử lại.");
            }
            await PointHistory.create({
                userId: user._id,
                pointsChanged: -actualUsedPoints,
                reason: `Sử dụng điểm cho đơn hàng #${newOrder.code}`,
                performedBy: user._id,
            });
        }
    }
    catch (error) {
        // Nếu tạo order thất bại, rollback lại kho
        for (const item of decrementedVariants) {
            await orderRepo.incrementVariantStock(item.variantId.toString(), item.quantity);
        }
        throw error;
    }
    // Gửi email bất đồng bộ, không đợi kết quả để tránh block response
    if (user.email) {
        sendOrderSuccessEmail(user.email, newOrder.code, finalTotalAmount).catch(console.error);
    }
    const mappedOrder = mapOrder(newOrder, orderItems);
    return mappedOrder;
};
// ── Source: order-pos.service.ts ──────────────────────────────
export const createPOSOrder = async (operator, data) => {
    const customerPhone = data.customerPhone?.trim();
    const customerName = data.customerName?.trim();
    let customerUser = null;
    if (customerPhone) {
        customerUser = await User.findOne({ phone: customerPhone, role: "customer" });
        // Implicit Customer Creation
        if (!customerUser && customerName) {
            customerUser = await User.create({
                name: customerName,
                phone: customerPhone,
                role: "customer",
                points: 0,
                isActive: true,
            });
        }
    }
    const normalizedItems = [];
    let subtotal = 0;
    for (const item of data.items) {
        if (!mongoose.Types.ObjectId.isValid(item.productId))
            throw badRequest("productId không hợp lệ");
        if (!item.variantId || !mongoose.Types.ObjectId.isValid(item.variantId))
            throw badRequest("variantId không hợp lệ");
        const product = await orderRepo.findProductById(item.productId);
        if (!product)
            throw notFound("Có sản phẩm không tồn tại");
        if (!product.isActive)
            throw badRequest(`Sản phẩm ${product.name} hiện không khả dụng`);
        const variant = await orderRepo.findVariantById(item.variantId);
        if (!variant || variant.productId.toString() !== item.productId)
            throw notFound("Phân loại hàng không hợp lệ");
        if (!variant.isActive)
            throw badRequest(`Phân loại ${variant.name} của sản phẩm ${product.name} hiện không khả dụng`);
        if (variant.stock < item.quantity)
            throw badRequest(`Sản phẩm ${product.name} (${variant.name}) không đủ tồn kho`);
        const unitPrice = variant.discountPrice && variant.discountPrice > 0 ? variant.discountPrice : variant.price;
        const lineTotal = unitPrice * item.quantity;
        subtotal += lineTotal;
        normalizedItems.push({
            productId: product._id,
            variantId: variant._id,
            productName: product.name,
            variantName: variant.name,
            imageUrl: variant.imageUrl || product.imageUrl,
            price: unitPrice,
            quantity: item.quantity,
            lineTotal,
        });
    }
    let userPoints = 0;
    let tierDiscountAmount = 0;
    if (customerUser) {
        userPoints = customerUser.points || 0;
        const customerTotalSpent = await getUserTotalSpent(customerUser._id.toString());
        tierDiscountAmount = calculateTierDiscount(customerTotalSpent, subtotal);
    }
    const orderCode = `POS-${generateOrderCode().replace("GLU-", "")}`;
    const providedDiscount = typeof data.discountAmount === "number" && data.discountAmount > 0 ? data.discountAmount : 0;
    // Tổng giảm giá (Discount tay ở POS + Chiết khấu Hạng)
    const totalDiscountAmount = Math.min(providedDiscount + tierDiscountAmount, subtotal);
    const totalAmountBeforePoints = Math.max(0, subtotal - totalDiscountAmount);
    // Xử lý dùng điểm (Tối đa 50% đơn)
    const requestedUsedPoints = typeof data.usedPoints === "number" && data.usedPoints > 0 ? data.usedPoints : 0;
    const maxPointsAllowed = Math.floor(totalAmountBeforePoints * MAX_POINTS_PCT);
    const actualUsedPoints = customerUser ? Math.min(requestedUsedPoints, userPoints, maxPointsAllowed) : 0;
    const finalTotalAmount = Math.max(0, totalAmountBeforePoints - actualUsedPoints);
    // 4. Trừ tồn kho trước (Atomic Increment with conditions)
    const decrementedVariants = [];
    try {
        for (const item of normalizedItems) {
            await orderRepo.decrementVariantStock(item.variantId.toString(), item.quantity);
            decrementedVariants.push(item);
        }
    }
    catch (error) {
        // Rollback
        for (const item of decrementedVariants) {
            await orderRepo.incrementVariantStock(item.variantId.toString(), item.quantity);
        }
        throw badRequest(error.message || "Sản phẩm vừa hết hàng, vui lòng thử lại.");
    }
    // 5. Tạo đơn hàng và xử lý (Saga Pattern)
    let newOrder;
    let orderItems;
    try {
        newOrder = await orderRepo.createOrder({
            code: orderCode,
            receiverName: customerUser ? customerUser.name : "Khách lẻ tại quầy",
            phone: customerUser ? customerUser.phone : "0000000000",
            province: "N/A",
            district: "N/A",
            ward: "N/A",
            street: "Bán tại quầy",
            orderStatus: "completed",
            paymentMethod: data.paymentMethod,
            subtotal,
            shippingFee: 0,
            voucherCode: "",
            discountAmount: totalDiscountAmount,
            tierDiscountAmount,
            usedPoints: actualUsedPoints,
            totalAmount: finalTotalAmount,
            note: data.note || (totalDiscountAmount > 0 ? `Giảm giá tại quầy: ${totalDiscountAmount.toLocaleString("vi-VN")}₫` : ""),
            userId: customerUser ? customerUser._id : null,
            channel: "pos",
            creatorId: operator._id,
            paymentStatus: "paid",
            earnedPoints: Math.floor(finalTotalAmount / POINTS_EARN_RATE),
            items: normalizedItems,
        });
        if (customerUser) {
            const pointsEarned = Math.floor(finalTotalAmount / POINTS_EARN_RATE);
            const netPoints = pointsEarned - actualUsedPoints;
            // Cập nhật điểm Atomic
            const updateQuery = { _id: customerUser._id };
            if (netPoints < 0) {
                updateQuery.points = { $gte: Math.abs(netPoints) };
            }
            const updatedUser = await User.findOneAndUpdate(updateQuery, { $inc: { points: netPoints } }, { returnDocument: "after" });
            if (!updatedUser) {
                throw badRequest("Điểm tích lũy của khách hàng không đủ hoặc đã thay đổi.");
            }
            if (actualUsedPoints > 0) {
                await PointHistory.create({
                    userId: customerUser._id,
                    pointsChanged: -actualUsedPoints,
                    reason: `Sử dụng điểm thanh toán đơn POS #${newOrder.code}`,
                    performedBy: operator._id,
                });
            }
            if (pointsEarned > 0) {
                await PointHistory.create({
                    userId: customerUser._id,
                    pointsChanged: pointsEarned,
                    reason: `Hoàn thành đơn hàng POS #${newOrder.code} (Tích luỹ)`,
                    performedBy: operator._id,
                });
            }
        }
        orderItems = newOrder.items;
        // Log inventory transactions
        for (const item of normalizedItems) {
            await InventoryTransaction.create({
                code: `TX-POS-${Math.floor(100000 + Math.random() * 900000)}`,
                productId: item.productId,
                variantId: item.variantId,
                type: "out",
                qty: item.quantity,
                creatorId: operator._id,
                date: new Date(),
            });
            // Tăng số lượng đã bán (soldCount) cho sản phẩm
            await Product.findByIdAndUpdate(item.productId, {
                $inc: { soldCount: item.quantity }
            });
        }
    }
    catch (error) {
        // Nếu lỗi tạo đơn hoặc lỗi database, hoàn kho
        for (const item of decrementedVariants) {
            await orderRepo.incrementVariantStock(item.variantId.toString(), item.quantity);
        }
        throw error;
    }
    return mapOrder(newOrder, orderItems);
};
