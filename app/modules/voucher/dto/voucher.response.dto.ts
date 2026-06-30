import type { VoucherDocument } from "../models/voucher.schema.js";

export interface VoucherResponse {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
  minOrderValue: number;
  maxDiscount?: number;
  startDate: string;
  endDate: string;
  usageLimit: number;
  usedCount: number;
  isActive: boolean;
  ttlMinutes?: number;
  overbookingLimit?: number;
}

export const mapVoucher = (voucher: VoucherDocument): VoucherResponse => ({
  id: voucher._id.toString(),
  code: voucher.code,
  discountType: voucher.discountType,
  discountValue: voucher.discountValue,
  minOrderValue: voucher.minOrderValue,
  maxDiscount: voucher.maxDiscount,
  startDate: voucher.startDate.toISOString(),
  endDate: voucher.endDate.toISOString(),
  usageLimit: voucher.usageLimit,
  usedCount: voucher.usedCount,
  isActive: voucher.isActive,
  ttlMinutes: voucher.ttlMinutes,
  overbookingLimit: voucher.overbookingLimit,
});
