/**
 * inventory.service.test.ts — Unit tests cho Inventory Service
 * Kiểm tra: createGoodsReceipt (stock update, transaction log), adjustStock (diff calculation).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

vi.mock("../../app/modules/inventory/inventory.repository.js");

import * as inventoryRepo from "../../app/modules/inventory/inventory.repository.js";
import * as inventoryService from "../../app/modules/inventory/inventory.service.js";

// Dùng ObjectId thật để tránh BSON parse errors khi service gọi new ObjectId(variantId)
const FAKE_VARIANT_ID   = new mongoose.Types.ObjectId().toString();
const FAKE_PRODUCT_ID   = new mongoose.Types.ObjectId().toString();
const FAKE_SUPPLIER_ID  = new mongoose.Types.ObjectId().toString();
const FAKE_OPERATOR_ID  = new mongoose.Types.ObjectId().toString();

const fakeOperator = {
  _id:  { toString: () => FAKE_OPERATOR_ID },
  name: "Admin",
};

const makeFakeVariant = (overrides: Record<string, any> = {}) => ({
  _id:       { toString: () => FAKE_VARIANT_ID },
  name:      "Kem 50ml",
  sku:       "SKU001",
  stock:     50,
  productId: { toString: () => FAKE_PRODUCT_ID },
  save:      vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const makeFakeSupplier = () => ({
  _id:  { toString: () => FAKE_SUPPLIER_ID },
  name: "Nhà cung cấp A",
});

beforeEach(() => vi.clearAllMocks());

// ── createGoodsReceipt ────────────────────────────────────────────────────────

describe("inventoryService.createGoodsReceipt", () => {
  const receiptInput = {
    supplierId: FAKE_SUPPLIER_ID,
    items: [
      { variantId: FAKE_VARIANT_ID, quantity: 20, importPrice: 50_000 },
    ],
  };

  it("cộng stock và tạo transaction sau khi nhập kho thành công", async () => {
    const fakeVariant  = makeFakeVariant({ stock: 30 });
    const fakeSupplier = makeFakeSupplier();
    const fakeProduct  = { _id: "product_id", name: "Kem dưỡng" };

    vi.mocked(inventoryRepo.findSupplierById).mockResolvedValue(fakeSupplier as any);
    vi.mocked(inventoryRepo.findVariantById).mockResolvedValue(fakeVariant as any);
    vi.mocked(inventoryRepo.findProductById).mockResolvedValue(fakeProduct as any);
    vi.mocked(inventoryRepo.createGoodsReceipt).mockResolvedValue({
      code: "GR-123", totalAmount: 1_000_000,
    } as any);
    vi.mocked(inventoryRepo.saveVariant).mockResolvedValue(undefined as any);
    vi.mocked(inventoryRepo.createTransaction).mockResolvedValue(undefined as any);

    await inventoryService.createGoodsReceipt(fakeOperator as any, receiptInput as any);

    // Stock phải được cộng thêm 20
    expect(fakeVariant.stock).toBe(50);  // 30 + 20
    expect(inventoryRepo.saveVariant).toHaveBeenCalledWith(fakeVariant);
    expect(inventoryRepo.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "in", qty: 20 })
    );
  });

  it("throw badRequest khi supplierId không hợp lệ", async () => {
    vi.mocked(inventoryRepo.findSupplierById).mockResolvedValue(null);

    await expect(inventoryService.createGoodsReceipt(fakeOperator as any, receiptInput as any))
      .rejects.toMatchObject({ status: 404 });
  });

  it("throw badRequest khi items rỗng", async () => {
    await expect(inventoryService.createGoodsReceipt(fakeOperator as any, { supplierId: FAKE_SUPPLIER_ID, items: [] }))
      .rejects.toMatchObject({ status: 400 });
  });
});

// ── adjustStock ───────────────────────────────────────────────────────────────

describe("inventoryService.adjustStock", () => {
  it("cập nhật stock và ghi transaction với diff dương", async () => {
    const fakeVariant = makeFakeVariant({ stock: 30 });
    vi.mocked(inventoryRepo.findVariantById).mockResolvedValue(fakeVariant as any);
    vi.mocked(inventoryRepo.saveVariant).mockResolvedValue(undefined as any);
    vi.mocked(inventoryRepo.createTransaction).mockResolvedValue(undefined as any);

    await inventoryService.adjustStock(fakeOperator as any, {
      variantId: FAKE_VARIANT_ID, actualStock: 50, reason: "Kiểm kho tháng 6"
    });

    expect(fakeVariant.stock).toBe(50);
    expect(inventoryRepo.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "adjustment", qty: 20 })
    );
  });

  it("ghi transaction với diff âm khi stock giảm", async () => {
    const fakeVariant = makeFakeVariant({ stock: 30 });
    vi.mocked(inventoryRepo.findVariantById).mockResolvedValue(fakeVariant as any);
    vi.mocked(inventoryRepo.saveVariant).mockResolvedValue(undefined as any);
    vi.mocked(inventoryRepo.createTransaction).mockResolvedValue(undefined as any);

    await inventoryService.adjustStock(fakeOperator as any, {
      variantId: FAKE_VARIANT_ID, actualStock: 10,
    });

    expect(fakeVariant.stock).toBe(10);
    expect(inventoryRepo.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ qty: -20 })
    );
  });

  it("không ghi transaction nếu stock không thay đổi", async () => {
    const fakeVariant = makeFakeVariant({ stock: 30 });
    vi.mocked(inventoryRepo.findVariantById).mockResolvedValue(fakeVariant as any);

    await inventoryService.adjustStock(fakeOperator as any, {
      variantId: FAKE_VARIANT_ID, actualStock: 30,
    });

    expect(inventoryRepo.createTransaction).not.toHaveBeenCalled();
  });

  it("throw notFound khi variant không tồn tại", async () => {
    vi.mocked(inventoryRepo.findVariantById).mockResolvedValue(null);

    await expect(inventoryService.adjustStock(fakeOperator as any, {
      variantId: FAKE_VARIANT_ID, actualStock: 10,
    })).rejects.toMatchObject({ status: 404 });
  });
});

// ── createSupplier ────────────────────────────────────────────────────────────

describe("inventoryService.createSupplier", () => {
  it("tạo nhà cung cấp thành công với name và phone hợp lệ", async () => {
    const fakeSupplier = { _id: "s_id", name: "NCC A", phone: "0901234567" };
    vi.mocked(inventoryRepo.createSupplier).mockResolvedValue(fakeSupplier as any);

    const result = await inventoryService.createSupplier({ name: "NCC A", phone: "0901234567" });
    expect(result.name).toBe("NCC A");
  });

  it("throw badRequest khi thiếu name hoặc phone", async () => {
    await expect(inventoryService.createSupplier({ name: "", phone: "" }))
      .rejects.toMatchObject({ status: 400 });
  });
});
