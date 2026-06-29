/**
 * voucher.integration.test.ts — Integration tests cho Voucher Service + Repository
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  connectTestDB,
  disconnectTestDB,
  clearCollections,
} from "./helpers/db-helper.js";
import mongoose from "mongoose";
import * as voucherService from "../../app/modules/voucher/voucher.service.js";
import Voucher from "../../app/modules/voucher/models/voucher.schema.js";

const FAKE_USER_ID = new mongoose.Types.ObjectId().toString();

beforeAll(async () => {
  await connectTestDB();
});
afterAll(async () => {
  await disconnectTestDB();
});
beforeEach(async () => {
  await clearCollections();
});

const makeVoucherData = (overrides: Record<string, any> = {}) => ({
  code: "TEST10",
  discountType: "percent",
  discountValue: 10,
  startDate: new Date(Date.now() - 86_400_000),
  endDate: new Date(Date.now() + 86_400_000),
  minOrderValue: 100_000,
  usageLimit: 50,
  maxDiscount: 50_000,
  isActive: true,
  ...overrides,
});

// ── CRUD ──────────────────────────────────────────────────────────────────────

describe("[Integration] Voucher — CRUD", () => {
  it("tạo voucher và tìm thấy trong DB", async () => {
    const result = await voucherService.createVoucher(makeVoucherData() as any);
    expect(result.code).toBe("TEST10");

    const inDB = await Voucher.findOne({ code: "TEST10" });
    expect(inDB).not.toBeNull();
    expect(inDB?.discountValue).toBe(10);
  });

  it("không thể tạo voucher trùng code", async () => {
    await voucherService.createVoucher(makeVoucherData() as any);
    await expect(
      voucherService.createVoucher(makeVoucherData() as any),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("xóa voucher thành công", async () => {
    const v = await voucherService.createVoucher(makeVoucherData() as any);
    await voucherService.deleteVoucher(v.id as string);

    const inDB = await Voucher.findOne({ code: "TEST10" });
    expect(inDB).toBeNull();
  });
});

// ── validateVoucher ───────────────────────────────────────────────────────────

describe("[Integration] Voucher — validateVoucher với DB thật", () => {
  beforeEach(async () => {
    await voucherService.createVoucher(makeVoucherData() as any);
  });

  it("validate thành công và tính đúng discount", async () => {
    const result = await voucherService.validateVoucher("TEST10", 300_000);
    // 300_000 * 10% = 30_000 < maxDiscount 50_000 → giữ nguyên
    expect(result.discountAmount).toBe(30_000);
  });

  it("throw badRequest khi dưới minOrderValue", async () => {
    await expect(
      voucherService.validateVoucher("TEST10", 50_000),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("atomicIncrementUsage cộng usedCount trong DB", async () => {
    await voucherService.incrementVoucherUsage("TEST10", FAKE_USER_ID);
    const inDB = await Voucher.findOne({ code: "TEST10" });
    expect(inDB?.usedCount).toBe(1);
  });

  it("hết lượt khi usedCount >= usageLimit", async () => {
    // Set usedCount = usageLimit
    await Voucher.updateOne(
      { code: "TEST10" },
      { usedCount: 50, usageLimit: 50 },
    );
    await expect(
      voucherService.validateVoucher("TEST10", 200_000),
    ).rejects.toMatchObject({ status: 400 });
  });
});
