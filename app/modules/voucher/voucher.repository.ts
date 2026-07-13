/**
 * voucher.repository.ts
 * Data access layer cho Voucher module.
 */
import { injectable } from "tsyringe";
import mongoose from "mongoose";
import Voucher from "./models/voucher.schema.js";
import User from "../user/models/user.schema.js";

// ── Voucher CRUD ──────────────────────────────────────────────────────────────

@injectable()
export class VoucherRepository {
  findAll = (query: Record<string, any> = {}, skip = 0, limit = 0) => {
  const q = Voucher.find(query).sort({ createdAt: -1 });
  if (limit > 0) q.skip(skip).limit(limit);
  return q.lean();
};

  countDocuments = (query: Record<string, any> = {}) => Voucher.countDocuments(query);

  findById = (id: string) => Voucher.findById(id);

  findByCode = (code: string) =>
  Voucher.findOne({ code: code.toUpperCase() });

  findByCodeExact = (code: string) => Voucher.findOne({ code });

  create = (data: any) => Voucher.create(data);

  save = (voucher: any) => voucher.save();

  findByIdAndDelete = (id: string) => Voucher.findByIdAndDelete(id);

  atomicIncrementUsage = async (code: string, userId?: string, session?: mongoose.ClientSession, maxAllowed?: number) => {
  const update: any = { $inc: { usedCount: 1 } };
  if (userId)
    update.$addToSet = { usedBy: new mongoose.Types.ObjectId(userId) };

  const query: any = { code: code.toUpperCase() };
  if (userId) {
    query.usedBy = { $ne: new mongoose.Types.ObjectId(userId) };
  }
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
    throw new Error("Voucher is out of uses or does not exist.");
  }
  return result;
};

/**
 * Decrease usedCount when rolling back (order failed).
 * Guard: only decrement if usedCount > 0 to avoid negative values.
 */
  atomicDecrementUsage = (code: string, userId?: string, session?: mongoose.ClientSession) => {
  const update: any = { $inc: { usedCount: -1 } };
  if (userId) update.$pull = { usedBy: new mongoose.Types.ObjectId(userId) };
  return Voucher.findOneAndUpdate(
    { code: code.toUpperCase(), usedCount: { $gt: 0 } },
    update,
    { returnDocument: "after", session },
  );
};

/**
 * Replace the entire usedBy array — used when an admin needs to reset the list of users who used the voucher.
 */
  setUsedBy = (
  voucherId: any,
  objectIds: mongoose.Types.ObjectId[],
) =>
  Voucher.findByIdAndUpdate(
    voucherId,
    { $set: { usedBy: objectIds } },
    { returnDocument: "after" },
  );

// ── Wallet (User's saved vouchers) ────────────────────────────────────────────

  findUserWithVouchers = (userId: string) =>
  User.findById(userId).populate({
    path: "savedVouchers",
    // Populate usedBy to determine the "used" state for each user
    select: "+usedBy",
  });

  addVoucherToWallet = (
  userId: string,
  voucherId: mongoose.Types.ObjectId,
) =>
  User.findByIdAndUpdate(
    userId,
    { $addToSet: { savedVouchers: voucherId } },
    { returnDocument: "after" },
  );

  removeVoucherFromWallet = (
  userId: string,
  voucherId: mongoose.Types.ObjectId,
) =>
  User.findByIdAndUpdate(
    userId,
    { $pull: { savedVouchers: voucherId } },
    { returnDocument: "after" },
  );

}
