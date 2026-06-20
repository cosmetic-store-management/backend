/**
 * voucher.repository.ts
 * Data access layer cho Voucher module.
 */
import mongoose from "mongoose";
import Voucher from "../../models/voucher.schema.js";
import User from "../../models/user.schema.js";
// ── Voucher CRUD ──────────────────────────────────────────────────────────────
export const findAll = (query = {}) => Voucher.find(query).sort({ createdAt: -1 }).lean();
export const findById = (id) => Voucher.findById(id);
export const findByCode = (code) => Voucher.findOne({ code: code.toUpperCase() });
export const findByCodeExact = (code) => Voucher.findOne({ code });
export const create = (data) => Voucher.create(data);
export const save = (voucher) => voucher.save();
export const findByIdAndDelete = (id) => Voucher.findByIdAndDelete(id);
// ── Usage Tracking — Atomic để tránh race condition ───────────────────────────
/**
 * Tăng usedCount và thêm userId vào usedBy (atomic $inc + $addToSet).
 * Dùng findOneAndUpdate thay vì save() để ngăn race condition khi nhiều user
 * cùng apply một voucher.
 */
export const atomicIncrementUsage = async (code, userId) => {
    const update = { $inc: { usedCount: 1 } };
    if (userId)
        update.$addToSet = { usedBy: new mongoose.Types.ObjectId(userId) };
    const result = await Voucher.findOneAndUpdate({
        code: code.toUpperCase(),
        $or: [
            { usageLimit: 0 },
            { $expr: { $lt: ["$usedCount", "$usageLimit"] } }
        ]
    }, update, { returnDocument: "after" });
    if (!result) {
        throw new Error("Mã giảm giá đã hết lượt sử dụng hoặc không tồn tại.");
    }
    return result;
};
/**
 * Giảm usedCount khi rollback (order thất bại).
 * Guard: chỉ decrement nếu usedCount > 0 để tránh giá trị âm.
 */
export const atomicDecrementUsage = (code, userId) => {
    const update = { $inc: { usedCount: -1 } };
    if (userId)
        update.$pull = { usedBy: new mongoose.Types.ObjectId(userId) };
    return Voucher.findOneAndUpdate({ code: code.toUpperCase(), usedCount: { $gt: 0 } }, update, { returnDocument: "after" });
};
// ── Wallet (User's saved vouchers) ────────────────────────────────────────────
export const findUserWithVouchers = (userId) => User.findById(userId).populate({
    path: "savedVouchers",
    // Cần populate usedBy để xác định trạng thái "đã dùng" của từng user
    select: "+usedBy",
});
export const addVoucherToWallet = (userId, voucherId) => User.findByIdAndUpdate(userId, { $addToSet: { savedVouchers: voucherId } }, { returnDocument: "after" });
export const removeVoucherFromWallet = (userId, voucherId) => User.findByIdAndUpdate(userId, { $pull: { savedVouchers: voucherId } }, { returnDocument: "after" });
