import { badRequest, notFound, conflict, } from "../../shared/errors/httpErrors.js";
import { mapVoucher } from "./dto/voucher.response.dto.js";
import * as voucherRepo from "./voucher.repository.js";
import { Types } from "mongoose";
// ── Admin CRUD ────────────────────────────────────────────────────────────────
export const getAllVouchers = async (includeInactive = false) => {
    const query = includeInactive
        ? {}
        : { isActive: true, endDate: { $gte: new Date() } };
    const vouchers = await voucherRepo.findAll(query);
    return vouchers.map(mapVoucher);
};
export const getVoucherById = async (id) => {
    const voucher = await voucherRepo.findById(id);
    if (!voucher)
        throw notFound("Không tìm thấy voucher");
    return mapVoucher(voucher);
};
export const updateVoucherUsedUsers = async (voucherId, usedUsers) => {
    const voucher = await voucherRepo.findById(voucherId);
    if (!voucher)
        throw notFound("Voucher không tồn tại");
    // Dùng atomic update qua repository thay vì gán trực tiếp vào document
    const objectIds = usedUsers.map((id) => new Types.ObjectId(id));
    return await voucherRepo.setUsedBy(voucherId, objectIds);
};
export const createVoucher = async (data) => {
    const existing = await voucherRepo.findByCodeExact(data.code);
    if (existing)
        throw conflict("Mã voucher đã tồn tại");
    if (new Date(data.startDate) >= new Date(data.endDate)) {
        throw badRequest("Ngày bắt đầu phải trước ngày kết thúc");
    }
    const voucher = await voucherRepo.create(data);
    return mapVoucher(voucher);
};
export const updateVoucher = async (id, data) => {
    const voucher = await voucherRepo.findById(id);
    if (!voucher)
        throw notFound("Không tìm thấy voucher");
    if (data.code && data.code !== voucher.code) {
        const existing = await voucherRepo.findByCodeExact(data.code);
        if (existing)
            throw conflict("Mã voucher đã tồn tại");
    }
    Object.assign(voucher, data);
    if (new Date(voucher.startDate) >= new Date(voucher.endDate)) {
        throw badRequest("Ngày bắt đầu phải trước ngày kết thúc");
    }
    await voucherRepo.save(voucher);
    return mapVoucher(voucher);
};
export const deleteVoucher = async (id) => {
    const result = await voucherRepo.findByIdAndDelete(id);
    if (!result)
        throw notFound("Không tìm thấy voucher");
};
// ── Checkout Integration ───────────────────────────────────────────────────────
export const validateVoucher = async (code, subtotal, shippingFee = 30000, userId) => {
    const voucher = await voucherRepo.findByCode(code);
    if (!voucher)
        throw notFound("Mã giảm giá không tồn tại");
    if (!voucher.isActive)
        throw badRequest("Mã giảm giá đã bị vô hiệu hóa");
    const now = new Date();
    if (now < voucher.startDate)
        throw badRequest("Mã giảm giá chưa đến thời gian sử dụng");
    if (now > voucher.endDate)
        throw badRequest("Mã giảm giá đã hết hạn");
    if (voucher.usageLimit > 0 && voucher.usedCount >= voucher.usageLimit) {
        throw badRequest("Mã giảm giá đã hết lượt sử dụng");
    }
    if (userId && voucher.usedBy?.some((id) => id.toString() === userId)) {
        throw badRequest("Bạn đã sử dụng mã giảm giá này");
    }
    if (subtotal < voucher.minOrderValue) {
        throw badRequest(`Đơn hàng phải từ ${voucher.minOrderValue.toLocaleString("vi-VN")}đ để áp dụng mã này`);
    }
    let discountAmount = 0;
    if (voucher.discountType === "fixed") {
        discountAmount = voucher.discountValue;
    }
    else if (voucher.discountType === "percent") {
        discountAmount = (subtotal * voucher.discountValue) / 100;
    }
    else if (voucher.discountType === "freeship") {
        discountAmount =
            shippingFee > voucher.discountValue ? voucher.discountValue : shippingFee;
    }
    if (voucher.maxDiscount && discountAmount > voucher.maxDiscount) {
        discountAmount = voucher.maxDiscount;
    }
    return {
        voucherCode: voucher.code,
        discountAmount,
        discountType: voucher.discountType,
    };
};
/**
 * Atomic increment usedCount — dùng khi order được tạo thành công.
 * Tránh race condition: $inc + $addToSet trong một findOneAndUpdate.
 */
export const incrementVoucherUsage = (code, userId, session) => voucherRepo.atomicIncrementUsage(code, userId, session);
/**
 * Atomic decrement usedCount — dùng khi order bị cancel/thất bại (rollback).
 * Guard: chỉ decrement nếu usedCount > 0.
 */
export const decrementVoucherUsage = (code, userId, session) => voucherRepo.atomicDecrementUsage(code, userId, session);
// ── Wallet ────────────────────────────────────────────────────────────────────
export const getWalletVouchers = async (userId) => {
    const user = await voucherRepo.findUserWithVouchers(userId);
    if (!user || !user.savedVouchers?.length)
        return [];
    const now = new Date();
    return user.savedVouchers
        .filter((v) => v.isActive &&
        new Date(v.startDate) <= now &&
        new Date(v.endDate) >= now &&
        (v.usageLimit === 0 || v.usedCount < v.usageLimit) &&
        !v.usedBy?.some((id) => id.toString() === userId))
        .map(mapVoucher);
};
export const getAllWalletVouchers = async (userId) => {
    const user = await voucherRepo.findUserWithVouchers(userId);
    if (!user || !user.savedVouchers?.length)
        return [];
    const now = new Date();
    return user.savedVouchers.map((v) => {
        let status;
        const usedByUser = v.usedBy?.some((id) => id.toString() === userId);
        if (usedByUser) {
            status = "used";
        }
        else if (new Date(v.endDate) < now) {
            status = "expired";
        }
        else if (v.usageLimit > 0 && v.usedCount >= v.usageLimit) {
            status = "exhausted";
        }
        else {
            status = "valid";
        }
        return { ...mapVoucher(v), status };
    });
};
export const collectVoucher = async (userId, code) => {
    const voucher = await voucherRepo.findByCode(code);
    if (!voucher)
        throw notFound("Không tìm thấy mã giảm giá");
    if (!voucher.isActive)
        throw badRequest("Mã giảm giá không còn hoạt động");
    const now = new Date();
    if (now > voucher.endDate)
        throw badRequest("Mã giảm giá đã hết hạn");
    if (now < voucher.startDate)
        throw badRequest("Mã giảm giá chưa đến thời gian sử dụng");
    if (voucher.usageLimit > 0 && voucher.usedCount >= voucher.usageLimit)
        throw badRequest("Mã giảm giá đã hết lượt sử dụng");
    // findUserWithVouchers dùng populate — cần lazy load để check alreadySaved
    const { default: User } = await import("../../models/user/user.schema.js");
    const user = await User.findById(userId);
    if (!user)
        throw notFound("Không tìm thấy người dùng");
    const alreadySaved = user.savedVouchers?.some((id) => id.toString() === voucher._id.toString());
    if (alreadySaved)
        throw conflict("Bạn đã lưu mã giảm giá này rồi");
    await voucherRepo.addVoucherToWallet(userId, voucher._id);
    return mapVoucher(voucher);
};
export const uncollectVoucher = async (userId, code) => {
    const voucher = await voucherRepo.findByCode(code);
    if (!voucher)
        throw notFound("Không tìm thấy mã giảm giá");
    await voucherRepo.removeVoucherFromWallet(userId, voucher._id);
};
