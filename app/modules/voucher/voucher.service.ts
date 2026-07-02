import {
  badRequest,
  notFound,
  conflict,
} from "../../shared/errors/httpErrors.js";
import { mapVoucher } from "./dto/voucher.response.dto.js";
import type {
  CreateVoucherInput,
  UpdateVoucherInput,
} from "./dto/voucher.request.dto.js";
import * as voucherRepo from "./voucher.repository.js";
import VoucherReservation from "./models/voucherReservation.schema.js";
import mongoose, { Types } from "mongoose";

// ── Admin CRUD ────────────────────────────────────────────────────────────────

export const getAllVouchers = async (filters: any = {}, page = 1, limit = 10) => {
  const query: any = {};
  const now = new Date();

  // Status Filter
  if (filters.status === "active") {
    query.isActive = true;
    query.startDate = { $lte: now };
    query.endDate = { $gte: now };
  } else if (filters.status === "upcoming") {
    query.isActive = true;
    query.startDate = { $gt: now };
  } else if (filters.status === "inactive") {
    query.isActive = false;
  } else if (filters.status === "expired") {
    query.isActive = true;
    query.endDate = { $lt: now };
  } else if (filters.status === "all") {
    // include all, do nothing
  } else {
    // Default (backward compatibility for old includeInactive boolean logic)
    if (filters === false) {
      query.isActive = true;
      query.endDate = { $gte: now };
    }
  }

  // Type Filter
  if (filters.type && filters.type !== "all") {
    query.discountType = filters.type;
  }

  // Search Filter
  if (filters.search) {
    query.code = { $regex: filters.search, $options: "i" };
  }

  const skip = (page - 1) * limit;
  const vouchers = await voucherRepo.findAll(query, skip, limit);
  const total = await voucherRepo.countDocuments(query);

  return {
    items: vouchers.map(mapVoucher),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const getVoucherById = async (id: string) => {
  const voucher = await voucherRepo.findById(id);
  if (!voucher) throw notFound("Voucher not found");
  return mapVoucher(voucher);
};

export const updateVoucherUsedUsers = async (
  voucherId: any,
  usedUsers: any[],
) => {
  const voucher = await voucherRepo.findById(voucherId);
  if (!voucher) throw notFound("Voucher does not exist");

  // Dùng atomic update qua repository thay vì gán trực tiếp vào document
  const objectIds = usedUsers.map((id: any) => new Types.ObjectId(id));
  return await voucherRepo.setUsedBy(voucherId, objectIds);
};

export const createVoucher = async (data: CreateVoucherInput) => {
  const existing = await voucherRepo.findByCodeExact(data.code);
  if (existing) throw conflict("Voucher code already exists");
  if (new Date(data.startDate) >= new Date(data.endDate)) {
    throw badRequest("Start date must be before end date");
  }

  const voucher = await voucherRepo.create(data);
  return mapVoucher(voucher);
};

export const updateVoucher = async (id: string, data: UpdateVoucherInput) => {
  const voucher = await voucherRepo.findById(id);
  if (!voucher) throw notFound("Voucher not found");

  if (data.code && data.code !== voucher.code) {
    const existing = await voucherRepo.findByCodeExact(data.code);
    if (existing) throw conflict("Voucher code already exists");
  }

  Object.assign(voucher, data);

  if (new Date(voucher.startDate) >= new Date(voucher.endDate)) {
    throw badRequest("Start date must be before end date");
  }

  await voucherRepo.save(voucher);
  return mapVoucher(voucher);
};

export const deleteVoucher = async (id: string) => {
  const result = await voucherRepo.findByIdAndDelete(id);
  if (!result) throw notFound("Voucher not found");
};

// ── Checkout Integration ───────────────────────────────────────────────────────

export const validateVoucher = async (
  code: string,
  subtotal: number,
  shippingFee = 30000,
  userId?: string,
) => {
  const voucher = await voucherRepo.findByCode(code);

  if (!voucher) throw notFound("Discount code does not exist");
  if (!voucher.isActive) throw badRequest("Discount code has been disabled");

  const now = new Date();
  if (now < voucher.startDate)
    throw badRequest("Discount code is not yet active");
  if (now > voucher.endDate) throw badRequest("Discount code has expired");

  const userHasReservation = userId
    ? await VoucherReservation.exists({ voucherId: voucher._id, userId })
    : false;

  if (voucher.usageLimit > 0 && voucher.usedCount >= voucher.usageLimit) {
    let allowedToBypass = false;
    if (userHasReservation && voucher.overbookingLimit !== 0) {
      if (voucher.overbookingLimit === -1) {
        allowedToBypass = true;
      } else if (voucher.usedCount < voucher.usageLimit + voucher.overbookingLimit) {
        allowedToBypass = true;
      }
    }

    if (!allowedToBypass) {
      throw badRequest("Discount code usage limit reached");
    }
  }

  if (userId && voucher.usedBy?.some((id: any) => id.toString() === userId)) {
    throw badRequest("You have already used this discount code");
  }

  if (subtotal < voucher.minOrderValue) {
    throw badRequest(
      `The order must be at least ${voucher.minOrderValue.toLocaleString("en-US")} ₫ to apply this code`,
    );
  }

  let discountAmount = 0;
  if (voucher.discountType === "fixed") {
    discountAmount = voucher.discountValue;
  } else if (voucher.discountType === "percent") {
    discountAmount = (subtotal * voucher.discountValue) / 100;
  } else if (voucher.discountType === "freeship") {
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
 * Atomic increment usedCount — used when an order is created successfully.
 * Tránh race condition: $inc + $addToSet trong một findOneAndUpdate.
 */
export const incrementVoucherUsage = async (code: string, userId?: string, session?: mongoose.ClientSession) => {
  let maxAllowed: number | undefined = undefined;

  if (userId) {
    const voucher = await voucherRepo.findByCode(code);
    if (voucher) {
      const hasReservation = await VoucherReservation.exists({ voucherId: voucher._id, userId });
      if (hasReservation && voucher.overbookingLimit !== 0) {
        maxAllowed = voucher.overbookingLimit === -1 ? -1 : voucher.usageLimit + voucher.overbookingLimit;
      }
    }
  }

  const result = await voucherRepo.atomicIncrementUsage(code, userId, session, maxAllowed);

  if (userId) {
    const voucher = await voucherRepo.findByCode(code);
    if (voucher) {
      await VoucherReservation.deleteOne({ voucherId: voucher._id, userId }).session(session || null);
    }
  }
  return result;
};

/**
 * Atomic decrement usedCount — dùng khi order bị cancel/thất bại (rollback).
 * Guard: chỉ decrement nếu usedCount > 0.
 */
export const decrementVoucherUsage = (code: string, userId?: string, session?: mongoose.ClientSession) =>
  voucherRepo.atomicDecrementUsage(code, userId, session);

// ── Wallet ────────────────────────────────────────────────────────────────────

export const getWalletVouchers = async (userId: string) => {
  const user = await voucherRepo.findUserWithVouchers(userId);
  if (!user || !user.savedVouchers?.length) return [];

  const now = new Date();

  // Get the list of vouchers currently reserved by this user
  const activeReservations = await VoucherReservation.find({ 
    userId,
    $or: [{ expiresAt: { $gt: now } }, { expiresAt: null }, { expiresAt: { $exists: false } }]
  }).select('voucherId').lean();
  const reservedVoucherIds = new Set(activeReservations.map(r => r.voucherId.toString()));

  return (user.savedVouchers as any[])
    .filter(
      (v: any) =>
        v.isActive &&
        new Date(v.startDate) <= now &&
        new Date(v.endDate) >= now &&
        (v.usageLimit === 0 || v.usedCount < v.usageLimit) &&
        !v.usedBy?.some((id: any) => id.toString() === userId) &&
        // Nếu voucher có cấu hình TTL, bắt buộc phải còn Reservation thì mới hiển thị trong Ví
        (v.ttlMinutes === 0 || reservedVoucherIds.has(v._id.toString()))
    )
    .map(mapVoucher);
};

export const getAllWalletVouchers = async (userId: string) => {
  const user = await voucherRepo.findUserWithVouchers(userId);
  if (!user || !user.savedVouchers?.length) return [];

  const now = new Date();

  const activeReservations = await VoucherReservation.find({ 
    userId,
    $or: [{ expiresAt: { $gt: now } }, { expiresAt: null }, { expiresAt: { $exists: false } }]
  }).select('voucherId expiresAt').lean();
  const reservationMap = new Map(activeReservations.map(r => [r.voucherId.toString(), r.expiresAt]));

  return (user.savedVouchers as any[])
    .map((v: any) => {
      let status: "valid" | "used" | "expired" | "exhausted";
      const usedByUser = v.usedBy?.some((id: any) => id.toString() === userId);
      const expiresAt = reservationMap.get(v._id.toString());
      const hasReservation = v.ttlMinutes === 0 || !!expiresAt;

      if (usedByUser) {
        status = "used";
      } else if (new Date(v.endDate) < now || !hasReservation) {
        // If the program has expired or the reservation has expired (reservation removed)
        status = "expired";
      } else if (v.usageLimit > 0 && v.usedCount >= v.usageLimit) {
        status = "exhausted";
      } else {
        status = "valid";
      }

      return { ...mapVoucher(v), status, expiresAt };
    });
};

export const collectVoucher = async (userId: string, code: string) => {
  const voucher = await voucherRepo.findByCode(code);
  if (!voucher) throw notFound("Discount code not found");
  if (!voucher.isActive) throw badRequest("Discount code is no longer active");

  const now = new Date();
  if (now > voucher.endDate) throw badRequest("Discount code has expired");
  if (now < voucher.startDate)
    throw badRequest("Discount code is not yet active");

  if (voucher.usageLimit > 0) {
    const activeReservations = await VoucherReservation.countDocuments({ 
      voucherId: voucher._id,
      $or: [{ expiresAt: { $gt: now } }, { expiresAt: null }, { expiresAt: { $exists: false } }]
    });

    // Giới hạn số lượng Lưu = usageLimit + overbookingLimit
    const maxCollect = voucher.overbookingLimit === -1
      ? Infinity
      : voucher.usageLimit + (voucher.overbookingLimit || 0);

    if (voucher.usedCount + activeReservations >= maxCollect) {
      throw badRequest("Discount code usage limit reached or fully reserved");
    }
  }

  // findUserWithVouchers uses populate — lazy load is needed to check alreadySaved
  const { default: User } = await import("../user/models/user.schema.js");
  const user = await User.findById(userId);
  if (!user) throw notFound("User not found");

  const alreadySaved = user.savedVouchers?.some(
    (id) => id.toString() === voucher._id.toString(),
  );

  if (alreadySaved) {
    throw conflict("You have already saved this discount code. If you did not use it in time, it has been revoked.");
  } else {
    // Only add to the wallet if it is not already there
    await voucherRepo.addVoucherToWallet(userId, voucher._id);
  }

  // Tạo Reservation với TTL (nếu có ttlMinutes > 0)
  const expiresAt = voucher.ttlMinutes > 0
    ? new Date(now.getTime() + voucher.ttlMinutes * 60000)
    : undefined;

  await VoucherReservation.create({
    voucherId: voucher._id,
    userId,
    expiresAt
  });

  return mapVoucher(voucher);
};

export const uncollectVoucher = async (userId: string, code: string) => {
  const voucher = await voucherRepo.findByCode(code);
  if (!voucher) throw notFound("Discount code not found");

  await voucherRepo.removeVoucherFromWallet(userId, voucher._id);
  await VoucherReservation.deleteOne({ voucherId: voucher._id, userId });
};
