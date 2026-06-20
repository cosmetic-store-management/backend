import * as orderRepo from "./order.repository.js";
import { mapOrder } from "./dto/order.response.dto.js";
import { notFound, forbidden, badRequest } from "../../shared/errors/httpErrors.js";
import User from "../../models/user.schema.js";
import mongoose from "mongoose";
import { decrementVoucherUsage } from "../voucher/voucher.service.js";
import PointHistory from "../../models/point-history.schema.js";
import Product from "../../models/product.schema.js";
import { POINTS_EARN_RATE, MAX_POINTS_PCT, DEFAULT_ITEM_WEIGHT_G, WEIGHT_SURCHARGE_STEP_G, WEIGHT_SURCHARGE_PER_STEP, WEIGHT_BASE_G, FREE_SHIP_THRESHOLD, DEFAULT_SHIPPING_FEE, getOrderSettings, ALLOWED_TRANSITIONS, generateOrderCode, calculateTierDiscount } from "./order.helper.js";
import { calcShippingFee, calcShippingFeeFromSettings } from "./order.shipping.js";
import { createVnpayUrl, handleVnpayIpn } from "./order.payment.js";
import { sendOrderCancelledEmail } from "../../shared/email/email.service.js";
// Re-export helpers for backward compatibility
export { POINTS_EARN_RATE, MAX_POINTS_PCT, DEFAULT_ITEM_WEIGHT_G, WEIGHT_SURCHARGE_STEP_G, WEIGHT_SURCHARGE_PER_STEP, WEIGHT_BASE_G, FREE_SHIP_THRESHOLD, DEFAULT_SHIPPING_FEE, getOrderSettings, ALLOWED_TRANSITIONS, generateOrderCode, calculateTierDiscount, calcShippingFee, calcShippingFeeFromSettings, createVnpayUrl, handleVnpayIpn };
export const attachItemsToOrders = async (orders) => {
    if (orders.length === 0)
        return [];
    return orders.map((order) => mapOrder(order, order.items || []));
};
export const restoreStock = async (items) => {
    for (const item of items) {
        if (item.variantId) {
            await orderRepo.incrementVariantStock(item.variantId.toString(), item.quantity);
        }
    }
};
export const getOrdersForAdmin = async ({ orderStatus, channel, userId, search, page = 1, limit = 20, paymentStatus, dateFrom, dateTo, shopId }) => {
    const parsedPage = Math.max(Number(page) || 1, 1);
    const parsedLimit = Math.max(Number(limit) || 20, 1);
    const skip = (parsedPage - 1) * parsedLimit;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query = {};
    if (shopId !== undefined) {
        const { default: mongoose } = await import("mongoose");
        query.shopId = shopId ? new mongoose.Types.ObjectId(shopId) : null;
    }
    if (orderStatus)
        query.orderStatus = orderStatus;
    if (channel)
        query.channel = channel;
    if (userId)
        query.userId = userId;
    if (paymentStatus)
        query.paymentStatus = paymentStatus;
    if (search) {
        query.$or = [
            { code: { $regex: search, $options: "i" } },
            { receiverName: { $regex: search, $options: "i" } },
            { phone: { $regex: search, $options: "i" } },
        ];
    }
    // Filter theo ngày đặt (createdAt)
    if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom)
            query.createdAt.$gte = new Date(dateFrom);
        if (dateTo) {
            const end = new Date(dateTo);
            end.setHours(23, 59, 59, 999);
            query.createdAt.$lte = end;
        }
    }
    const [orders, total] = await Promise.all([
        orderRepo.findOrders(query, skip, parsedLimit),
        orderRepo.countOrders(query),
    ]);
    const mappedOrders = await attachItemsToOrders(orders);
    return {
        orders: mappedOrders,
        pagination: { page: parsedPage, limit: parsedLimit, total, totalPages: Math.ceil(total / parsedLimit) },
    };
};
export const getMyOrders = async (userId) => {
    const orders = await orderRepo.findOrdersByUserId(userId);
    return attachItemsToOrders(orders);
};
export const getOrder = async (orderId, requestUser) => {
    const order = await orderRepo.findOrderById(orderId);
    if (!order)
        throw notFound("Không tìm thấy đơn hàng");
    const isAdmin = requestUser.role === "owner" || requestUser.role === "staff";
    const isOwner = String(order.userId) === String(requestUser._id);
    if (!isAdmin && !isOwner)
        throw forbidden("Bạn không có quyền truy cập đơn hàng này");
    const items = order.items || [];
    return mapOrder(order, items);
};
// ── Source: order-management.service.ts ──────────────────────────────
export const updateOrderStatus = async (orderId, data, requestUser, shopId) => {
    const query = { _id: orderId };
    if (shopId)
        query.shopId = new mongoose.Types.ObjectId(shopId);
    const order = await orderRepo.findOne(query);
    if (!order)
        throw notFound("Không tìm thấy đơn hàng hoặc đơn hàng không thuộc hệ thống của bạn");
    let previousStatus = order.orderStatus;
    if (data.orderStatus !== undefined) {
        if (data.orderStatus !== order.orderStatus && !ALLOWED_TRANSITIONS[order.orderStatus]?.includes(data.orderStatus)) {
            throw badRequest("Không thể chuyển trạng thái đơn hàng như yêu cầu");
        }
        previousStatus = order.orderStatus;
        order.orderStatus = data.orderStatus;
    }
    if (data.trackingCode !== undefined) {
        order.trackingCode = data.trackingCode.trim();
    }
    if (data.receiverName !== undefined) {
        const normalized = data.receiverName.trim();
        if (!normalized)
            throw badRequest("Tên người nhận không được để trống");
        order.receiverName = normalized;
    }
    if (data.phone !== undefined) {
        const normalized = data.phone.trim();
        if (!normalized)
            throw badRequest("Số điện thoại không được để trống");
        order.phone = normalized;
    }
    await orderRepo.saveOrder(order);
    const items = order.items || [];
    // Logic hoàn trả hàng / hủy đơn -> trả lại kho
    if ((data.orderStatus === "cancelled" || data.orderStatus === "returned") &&
        (previousStatus !== "cancelled" && previousStatus !== "returned")) {
        // Nếu đơn hàng đã thanh toán (VNPay), chuyển trạng thái sang refund_pending để kế toán hoàn tiền tay
        if (order.paymentStatus === "paid") {
            order.paymentStatus = "refund_pending";
        }
        await restoreStock(items);
        if (order.voucherCode) {
            await decrementVoucherUsage(order.voucherCode, order.userId?.toString());
        }
        if (order.userId) {
            const userDoc = await User.findById(order.userId);
            if (userDoc) {
                let changed = false;
                if ((order.usedPoints || 0) > 0) {
                    userDoc.points = (userDoc.points || 0) + (order.usedPoints || 0);
                    await PointHistory.create({
                        userId: userDoc._id,
                        pointsChanged: order.usedPoints,
                        reason: `Hoàn điểm do đơn hàng #${order.code} bị ${data.orderStatus === "cancelled" ? "hủy" : "trả lại"}`,
                        performedBy: requestUser?._id,
                    });
                    order.usedPoints = 0;
                    changed = true;
                }
                if (previousStatus === "completed" && order.earnedPoints && order.earnedPoints > 0) {
                    userDoc.points = (userDoc.points || 0) - order.earnedPoints;
                    await PointHistory.create({
                        userId: userDoc._id,
                        pointsChanged: -order.earnedPoints,
                        reason: `Thu hồi điểm do đơn hàng #${order.code} bị ${data.orderStatus === "cancelled" ? "hủy" : "trả lại"}`,
                        performedBy: requestUser?._id,
                    });
                    order.earnedPoints = 0;
                    changed = true;
                }
                if (changed) {
                    await userDoc.save();
                    await orderRepo.saveOrder(order);
                }
            }
        }
        // Nếu đơn hàng trước đó đã hoàn thành thì trừ lại soldCount
        if (previousStatus === "completed") {
            for (const item of items) {
                if (item.productId) {
                    await Product.findByIdAndUpdate(item.productId, {
                        $inc: { soldCount: -item.quantity }
                    });
                }
            }
        }
    }
    // Logic CRM Tích điểm khi hoàn thành
    if (data.orderStatus === "completed" && previousStatus !== "completed") {
        if (order.userId) {
            const userDoc = await User.findById(order.userId);
            if (userDoc) {
                // Tích điểm: 1 điểm mỗi POINTS_EARN_RATE VND (hiện tại 100đ/điểm)
                const pointsEarned = Math.floor(order.totalAmount / POINTS_EARN_RATE);
                userDoc.points = (userDoc.points || 0) + pointsEarned;
                await userDoc.save();
                await PointHistory.create({
                    userId: userDoc._id,
                    pointsChanged: pointsEarned,
                    reason: `Hoàn thành đơn hàng #${order.code} (Tích luỹ)`,
                    performedBy: requestUser._id,
                });
                order.earnedPoints = pointsEarned;
                await orderRepo.saveOrder(order);
            }
        }
        // Tăng số lượng đã bán (soldCount) cho các sản phẩm trong đơn hàng
        for (const item of items) {
            if (item.productId) {
                await Product.findByIdAndUpdate(item.productId, {
                    $inc: { soldCount: item.quantity }
                });
            }
        }
    }
    return mapOrder(order, items);
};
export const cancelOrder = async (orderId, requestUser) => {
    const order = await orderRepo.findOrderById(orderId);
    if (!order)
        throw notFound("Không tìm thấy đơn hàng");
    const isAdmin = ["owner", "manager", "staff"].includes(requestUser.role);
    const isOwner = String(order.userId) === String(requestUser._id);
    if (!isAdmin && !isOwner)
        throw forbidden("Bạn không có quyền thao tác đơn hàng này");
    if (order.orderStatus !== "pending")
        throw badRequest("Chỉ có thể hủy đơn hàng đang chờ xử lý");
    order.orderStatus = "cancelled";
    await orderRepo.saveOrder(order);
    const items = order.items || [];
    await restoreStock(items);
    if (order.voucherCode) {
        await decrementVoucherUsage(order.voucherCode, order.userId?.toString());
    }
    if ((order.usedPoints || 0) > 0 && order.userId) {
        const userDoc = await User.findById(order.userId);
        if (userDoc) {
            userDoc.points = (userDoc.points || 0) + (order.usedPoints || 0);
            await userDoc.save();
            await PointHistory.create({
                userId: userDoc._id,
                pointsChanged: order.usedPoints,
                reason: `Hoàn điểm do đơn hàng #${order.code} bị hủy`,
                performedBy: requestUser?._id,
            });
            order.usedPoints = 0;
            await orderRepo.saveOrder(order);
        }
    }
    if (order.userId) {
        const user = await User.findById(order.userId);
        if (user && user.email) {
            sendOrderCancelledEmail(user.email, order.code).catch(console.error);
        }
    }
    return mapOrder(order, items);
};
// (Đã dời mockPayment và handleVnpayIpn sang order.payment.ts)
// (Đã dời checkout logic sang order.checkout.ts)
export { getUserTotalSpent, previewOrder, createOrder, createPOSOrder } from "./order.checkout.js";
