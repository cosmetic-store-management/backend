/**
 * voucher.repository.ts
 * Data access layer cho Voucher module.
 */
import mongoose from "mongoose";
import Voucher from "./models/voucher.schema.js";
import User from "../user/models/user.schema.js";
// ── Voucher CRUD ──────────────────────────────────────────────────────────────
export const findAll = (query = {}, skip = 0, limit = 0) => {
    const q = Voucher.find(query).sort({ createdAt: -1 });
    if (limit > 0)
        q.skip(skip).limit(limit);
    return q.lean();
};
export const countDocuments = (query = {}) => Voucher.countDocuments(query);
export const findById = (id) => Voucher.findById(id);
export const findByCode = (code) => Voucher.findOne({ code: code.toUpperCase() });
export const findByCodeExact = (code) => Voucher.findOne({ code });
export const create = (data) => Voucher.create(data);
export const save = (voucher) => voucher.save();
export const findByIdAndDelete = (id) => Voucher.findByIdAndDelete(id);
export const atomicIncrementUsage = async (code, userId, session, maxAllowed) => {
    const update = { $inc: { usedCount: 1 } };
    if (userId)
        update.$addToSet = { usedBy: new mongoose.Types.ObjectId(userId) };
    const query = { code: code.toUpperCase() };
    if (userId) {
        query.usedBy = { $ne: new mongoose.Types.ObjectId(userId) };
    }
    if (maxAllowed !== -1) {
        if (maxAllowed !== undefined) {
            // Overbooking limit constraint
            query.$expr = { $lt: ["$usedCount", maxAllowed] };
        }
        else {
            // Normal limit constraint
            query.$or = [
                { usageLimit: 0 },
                { $expr: { $lt: ["$usedCount", "$usageLimit"] } },
            ];
        }
    }
    const result = await Voucher.findOneAndUpdate(query, update, { session, returnDocument: "after" });
    if (!result) {
        throw new Error("Voucher is out of uses or does not exist.");
    }
    return result;
};
/**
 * Decrease usedCount when rolling back (order failed).
 * Guard: only decrement if usedCount > 0 to avoid negative values.
 */
export const atomicDecrementUsage = (code, userId, session) => {
    const update = { $inc: { usedCount: -1 } };
    if (userId)
        update.$pull = { usedBy: new mongoose.Types.ObjectId(userId) };
    return Voucher.findOneAndUpdate({ code: code.toUpperCase(), usedCount: { $gt: 0 } }, update, { returnDocument: "after", session });
};
/**
 * Replace the entire usedBy array — used when an admin needs to reset the list of users who used the voucher.
 */
export const setUsedBy = (voucherId, objectIds) => Voucher.findByIdAndUpdate(voucherId, { $set: { usedBy: objectIds } }, { returnDocument: "after" });
// ── Wallet (User's saved vouchers) ────────────────────────────────────────────
export const findUserWithVouchers = (userId) => User.findById(userId).populate({
    path: "savedVouchers",
    // Populate usedBy to determine the "used" state for each user
    select: "+usedBy",
});
export const addVoucherToWallet = (userId, voucherId) => User.findByIdAndUpdate(userId, { $addToSet: { savedVouchers: voucherId } }, { returnDocument: "after" });
export const removeVoucherFromWallet = (userId, voucherId) => User.findByIdAndUpdate(userId, { $pull: { savedVouchers: voucherId } }, { returnDocument: "after" });
