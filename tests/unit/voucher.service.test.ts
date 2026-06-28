/**
 * voucher.service.test.ts — Unit tests cho Voucher Service
 * Strategy: Mock voucherRepo để kiểm tra business logic của validateVoucher và các hàm CRUD.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../app/modules/voucher/voucher.repository.js");
vi.mock("../../app/modules/voucher/dto/voucher.response.dto.js", () => ({
  mapVoucher: (v: any) => ({
    id: v._id?.toString() ?? "vid",
    code: v.code,
    discountType: v.discountType,
  }),
}));

import * as voucherRepo from "../../app/modules/voucher/voucher.repository.js";
import * as voucherService from "../../app/modules/voucher/voucher.service.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeFakeVoucher = (overrides: Record<string, any> = {}) => ({
  _id: { toString: () => "voucher_id" },
  code: "GIAM10",
  isActive: true,
  startDate: new Date(Date.now() - 86_400_000), // hôm qua
  endDate: new Date(Date.now() + 86_400_000), // ngày mai
  usageLimit: 100,
  usedCount: 0,
  usedBy: [],
  minOrderValue: 100_000,
  discountType: "percent",
  discountValue: 10,
  maxDiscount: 50_000,
  save: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

beforeEach(() => vi.clearAllMocks());

// ── validateVoucher ───────────────────────────────────────────────────────────

describe("voucherService.validateVoucher", () => {
  it("trả về discountAmount đúng với voucher percent", async () => {
    vi.mocked(voucherRepo.findByCode).mockResolvedValue(
      makeFakeVoucher() as any,
    );

    const result = await voucherService.validateVoucher("GIAM10", 500_000);
    // 500_000 * 10% = 50_000 (đúng bằng maxDiscount)
    expect(result.discountAmount).toBe(50_000);
    expect(result.voucherCode).toBe("GIAM10");
  });

  it("áp dụng maxDiscount khi tính toán vượt quá giới hạn", async () => {
    const voucher = makeFakeVoucher({ discountValue: 30, maxDiscount: 30_000 });
    vi.mocked(voucherRepo.findByCode).mockResolvedValue(voucher as any);

    const result = await voucherService.validateVoucher("GIAM30", 500_000);
    // 500_000 * 30% = 150_000 > maxDiscount 30_000 → clamp
    expect(result.discountAmount).toBe(30_000);
  });

  it("trả về discountAmount cố định với voucher fixed", async () => {
    const voucher = makeFakeVoucher({
      discountType: "fixed",
      discountValue: 50_000,
      maxDiscount: 0,
    });
    vi.mocked(voucherRepo.findByCode).mockResolvedValue(voucher as any);

    const result = await voucherService.validateVoucher("FIXED50", 200_000);
    expect(result.discountAmount).toBe(50_000);
  });

  it("throw notFound khi voucher không tồn tại", async () => {
    vi.mocked(voucherRepo.findByCode).mockResolvedValue(null);

    await expect(
      voucherService.validateVoucher("INVALID", 200_000),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throw badRequest khi voucher bị vô hiệu hóa", async () => {
    vi.mocked(voucherRepo.findByCode).mockResolvedValue(
      makeFakeVoucher({ isActive: false }) as any,
    );

    await expect(
      voucherService.validateVoucher("GIAM10", 200_000),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throw badRequest khi voucher hết hạn", async () => {
    const expired = makeFakeVoucher({
      endDate: new Date(Date.now() - 86_400_000),
    }); // qua hạn
    vi.mocked(voucherRepo.findByCode).mockResolvedValue(expired as any);

    await expect(
      voucherService.validateVoucher("EXPIRED", 200_000),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throw badRequest khi voucher chưa đến thời gian dùng", async () => {
    const notYet = makeFakeVoucher({
      startDate: new Date(Date.now() + 86_400_000),
    }); // ngày mai
    vi.mocked(voucherRepo.findByCode).mockResolvedValue(notYet as any);

    await expect(
      voucherService.validateVoucher("FUTURE", 200_000),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throw badRequest khi hết lượt dùng (usedCount >= usageLimit)", async () => {
    const exhausted = makeFakeVoucher({ usageLimit: 10, usedCount: 10 });
    vi.mocked(voucherRepo.findByCode).mockResolvedValue(exhausted as any);

    await expect(
      voucherService.validateVoucher("USED_UP", 200_000),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throw badRequest khi đơn hàng dưới minOrderValue", async () => {
    vi.mocked(voucherRepo.findByCode).mockResolvedValue(
      makeFakeVoucher({ minOrderValue: 500_000 }) as any,
    );

    await expect(voucherService.validateVoucher("GIAM10", 100_000)) // 100k < 500k
      .rejects.toMatchObject({ status: 400 });
  });

  it("throw badRequest khi user đã sử dụng voucher này", async () => {
    const userId = "user_abc";
    const voucher = makeFakeVoucher({ usedBy: [{ toString: () => userId }] });
    vi.mocked(voucherRepo.findByCode).mockResolvedValue(voucher as any);

    await expect(
      voucherService.validateVoucher("GIAM10", 200_000, 30_000, userId),
    ).rejects.toMatchObject({ status: 400 });
  });
});

// ── createVoucher ─────────────────────────────────────────────────────────────

describe("voucherService.createVoucher", () => {
  const validInput = {
    code: "NEW10",
    discountType: "percent" as const,
    discountValue: 10,
    startDate: new Date(Date.now() - 1000).toISOString(),
    endDate: new Date(Date.now() + 86_400_000).toISOString(),
    minOrderValue: 0,
    usageLimit: 50,
    isActive: true,
  };

  it("tạo voucher thành công khi code chưa tồn tại", async () => {
    vi.mocked(voucherRepo.findByCodeExact).mockResolvedValue(null);
    vi.mocked(voucherRepo.create).mockResolvedValue(
      makeFakeVoucher({ code: "NEW10" }) as any,
    );

    const result = await voucherService.createVoucher(validInput as any);
    expect(result.code).toBe("NEW10");
  });

  it("throw conflict khi code đã tồn tại", async () => {
    vi.mocked(voucherRepo.findByCodeExact).mockResolvedValue(
      makeFakeVoucher() as any,
    );

    await expect(
      voucherService.createVoucher(validInput as any),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("throw badRequest khi startDate >= endDate", async () => {
    vi.mocked(voucherRepo.findByCodeExact).mockResolvedValue(null);

    const badInput = {
      ...validInput,
      startDate: new Date(Date.now() + 86_400_000).toISOString(), // ngày mai
      endDate: new Date(Date.now() + 3_600_000).toISOString(), // 1h sau (trước startDate)
    };

    await expect(
      voucherService.createVoucher(badInput as any),
    ).rejects.toMatchObject({ status: 400 });
  });
});
