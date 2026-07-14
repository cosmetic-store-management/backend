/**
 * voucher.repository.ts
 * Data access layer cho Voucher module.
 */
import { injectable, inject } from "tsyringe";
import mongoose from "mongoose";
import Voucher from "./models/voucher.schema.js";
import VoucherReservation from "./models/voucherReservation.schema.js";
import { UserRepository } from "../../identity/user/user.repository.js";

// ── Voucher CRUD ──────────────────────────────────────────────────────────────

@injectable()
export class VoucherRepository {
  constructor(@inject(UserRepository) private readonly userRepository: UserRepository) {}

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

  findUserWithVouchers = (userId: string) => {
    return this.userRepository.findById(userId).populate({
      path: "savedVouchers",
      // Populate usedBy to determine the "used" state for each user
      select: "+usedBy",
    });
  }

  addVoucherToWallet = (
  userId: string,
  voucherId: mongoose.Types.ObjectId,
) =>
  this.userRepository.addSavedVoucher(userId, voucherId);

  removeVoucherFromWallet = (
  userId: string,
  voucherId: mongoose.Types.ObjectId,
) =>
  this.userRepository.removeSavedVoucher(userId, voucherId);

// ── Voucher Reservation ───────────────────────────────────────────────────────

  checkReservationExists = (voucherId: any, userId: string) => 
    VoucherReservation.exists({ voucherId, userId });

  deleteReservation = (voucherId: any, userId: string, session?: mongoose.ClientSession) =>
    VoucherReservation.deleteOne({ voucherId, userId }).session(session || null);

  findActiveReservations = (voucherId: any) =>
    VoucherReservation.find({ 
      voucherId, 
      expiresAt: { $gt: new Date() },
      status: "reserved" 
    });

  findUserReservations = (userId: string) =>
    VoucherReservation.find({ 
      userId, 
      $or: [{ expiresAt: { $gt: new Date() } }, { expiresAt: null }, { expiresAt: { $exists: false } }]
    }).lean();

  countActiveReservations = (voucherId: any) =>
    VoucherReservation.countDocuments({ 
      voucherId, 
      $or: [{ expiresAt: { $gt: new Date() } }, { expiresAt: null }, { expiresAt: { $exists: false } }]
    });

  findUserById = (userId: string) => this.userRepository.findById(userId);

  createReservation = (data: any) => VoucherReservation.create(data);

}
