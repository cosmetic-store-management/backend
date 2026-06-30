/**
 * voucher.repository.ts
 * Data access layer cho Voucher module.
 */
import mongoose from "mongoose";
import Voucher from "./models/voucher.schema.js";
import User from "../user/models/user.schema.js";

// ── Voucher CRUD ──────────────────────────────────────────────────────────────

export const findAll = (query: Record<string, any> = {}, skip = 0, limit = 0) => {
  const q = Voucher.find(query).sort({ createdAt: -1 });
  if (limit > 0) q.skip(skip).limit(limit);
  return q.lean();
};

export const countDocuments = (query: Record<string, any> = {}) => Voucher.countDocuments(query);

export const findById = (id: string) => Voucher.findById(id);

export const findByCode = (code: string) =>
  Voucher.findOne({ code: code.toUpperCase() });

export const findByCodeExact = (code: string) => Voucher.findOne({ code });

export const create = (data: any) => Voucher.create(data);

export const save = (voucher: any) => voucher.save();

export const findByIdAndDelete = (id: string) => Voucher.findByIdAndDelete(id);

export const atomicIncrementUsage = async (code: string, userId?: string, session?: mongoose.ClientSession, maxAllowed?: number) => {
  const update: any = { $inc: { usedCount: 1 } };
  if (userId)
    update.$addToSet = { usedBy: new mongoose.Types.ObjectId(userId) };

  const query: any = { code: code.toUpperCase() };
  if (maxAllowed !== -1) {
    if (maxAllowed !== undefined) {
      // Overbooking limit constraint
      query.$expr = { $lt: ["$usedCount", maxAllowed] };
    } else {
      // Normal limit constraint
      query.$or = [
        { usageLimit: 0 },
        { $expr: { $lt: ["$usedCount", "$usageLimit"] } },
      ];
    }
  }

  const result = await Voucher.findOneAndUpdate(
    query,
    update,
    { session, returnDocument: "after" },
  );

  if (!result) {
    throw new Error("Mã giảm giá đã hết lượt sử dụng hoặc không tồn tại.");
  }
  return result;
};

/**
 * Giảm usedCount khi rollback (order thất bại).
 * Guard: chỉ decrement nếu usedCount > 0 để tránh giá trị âm.
 */
export const atomicDecrementUsage = (code: string, userId?: string, session?: mongoose.ClientSession) => {
  const update: any = { $inc: { usedCount: -1 } };
  if (userId) update.$pull = { usedBy: new mongoose.Types.ObjectId(userId) };
  return Voucher.findOneAndUpdate(
    { code: code.toUpperCase(), usedCount: { $gt: 0 } },
    update,
    { returnDocument: "after", session },
  );
};

/**
 * Ghi đè toàn bộ mảng usedBy — dùng khi admin cần reset danh sách users đã dùng voucher.
 */
export const setUsedBy = (
  voucherId: any,
  objectIds: mongoose.Types.ObjectId[],
) =>
  Voucher.findByIdAndUpdate(
    voucherId,
    { $set: { usedBy: objectIds } },
    { returnDocument: "after" },
  );

// ── Wallet (User's saved vouchers) ────────────────────────────────────────────

export const findUserWithVouchers = (userId: string) =>
  User.findById(userId).populate({
    path: "savedVouchers",
    // Cần populate usedBy để xác định trạng thái "đã dùng" của từng user
    select: "+usedBy",
  });

export const addVoucherToWallet = (
  userId: string,
  voucherId: mongoose.Types.ObjectId,
) =>
  User.findByIdAndUpdate(
    userId,
    { $addToSet: { savedVouchers: voucherId } },
    { returnDocument: "after" },
  );

export const removeVoucherFromWallet = (
  userId: string,
  voucherId: mongoose.Types.ObjectId,
) =>
  User.findByIdAndUpdate(
    userId,
    { $pull: { savedVouchers: voucherId } },
    { returnDocument: "after" },
  );
