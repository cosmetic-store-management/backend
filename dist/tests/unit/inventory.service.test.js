/**
 * inventory.service.test.ts — Unit tests cho Inventory Service
 * Kiểm tra: createGoodsReceipt (stock update, transaction log), adjustStock (diff calculation).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
vi.mock("../../app/modules/inventory/inventory.repository.js");
import * as inventoryRepo from "../../app/modules/inventory/inventory.repository.js";
import * as inventoryService from "../../app/modules/inventory/inventory.service.js";
vi.spyOn(mongoose, "startSession").mockResolvedValue({
    startTransaction: vi.fn(),
    commitTransaction: vi.fn(),
    abortTransaction: vi.fn(),
    endSession: vi.fn(),
});
// Dùng ObjectId thật để tránh BSON parse errors khi service gọi new ObjectId(variantId)
const FAKE_VARIANT_ID = new mongoose.Types.ObjectId().toString();
const FAKE_PRODUCT_ID = new mongoose.Types.ObjectId().toString();
const FAKE_SUPPLIER_ID = new mongoose.Types.ObjectId().toString();
const FAKE_OPERATOR_ID = new mongoose.Types.ObjectId().toString();
const fakeOperator = {
    _id: { toString: () => FAKE_OPERATOR_ID },
    name: "Admin",
};
const makeFakeVariant = (overrides = {}) => ({
    _id: { toString: () => FAKE_VARIANT_ID },
    name: "Kem 50ml",
    sku: "SKU001",
    stock: 50,
    productId: { toString: () => FAKE_PRODUCT_ID },
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
});
const makeFakeSupplier = () => ({
    _id: { toString: () => FAKE_SUPPLIER_ID },
    name: "Nhà cung cấp A",
});
beforeEach(() => vi.clearAllMocks());
// ── createGoodsReceipt ────────────────────────────────────────────────────────
describe("inventoryService.createGoodsReceipt", () => {
    const receiptInput = {
        supplierId: FAKE_SUPPLIER_ID,
        items: [{ variantId: FAKE_VARIANT_ID, quantity: 20, importPrice: 50_000 }],
    };
    it("cộng stock và tạo transaction sau khi nhập kho thành công", async () => {
        const fakeVariant = makeFakeVariant({ stock: 30 });
        const fakeSupplier = makeFakeSupplier();
        const fakeProduct = { _id: "product_id", name: "Kem dưỡng" };
        vi.mocked(inventoryRepo.findSupplierById).mockResolvedValue(fakeSupplier);
        vi.mocked(inventoryRepo.findVariantById).mockResolvedValue(fakeVariant);
        vi.mocked(inventoryRepo.findProductById).mockResolvedValue(fakeProduct);
        vi.mocked(inventoryRepo.createGoodsReceipt).mockResolvedValue({
            _id: { toString: () => "gr_id" },
            code: "GR-123",
            totalAmount: 1_000_000,
            supplierId: { toString: () => FAKE_SUPPLIER_ID },
            items: [],
            createdAt: new Date(),
        });
        vi.mocked(inventoryRepo.atomicUpdateStock).mockResolvedValue({
            ...fakeVariant,
            stock: 50,
        });
        vi.mocked(inventoryRepo.createTransaction).mockResolvedValue(undefined);
        await inventoryService.createGoodsReceipt(fakeOperator, receiptInput);
        // atomicUpdateStock phải được gọi với qty = 20 (số lượng nhập kho)
        expect(inventoryRepo.atomicUpdateStock).toHaveBeenCalledWith(fakeVariant._id, 20, expect.anything());
        expect(inventoryRepo.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ type: "in", qty: 20 }), expect.anything());
    });
    it("throw badRequest khi supplierId không hợp lệ", async () => {
        vi.mocked(inventoryRepo.findSupplierById).mockResolvedValue(null);
        await expect(inventoryService.createGoodsReceipt(fakeOperator, receiptInput)).rejects.toMatchObject({ status: 404 });
    });
    it("throw badRequest khi items rỗng", async () => {
        await expect(inventoryService.createGoodsReceipt(fakeOperator, {
            supplierId: FAKE_SUPPLIER_ID,
            items: [],
        })).rejects.toMatchObject({ status: 400 });
    });
});
// ── adjustStock ───────────────────────────────────────────────────────────────
describe("inventoryService.adjustStock", () => {
    it("cập nhật stock và ghi transaction với diff dương", async () => {
        const fakeVariant = makeFakeVariant({ stock: 30 });
        vi.mocked(inventoryRepo.findVariantById).mockResolvedValue(fakeVariant);
        vi.mocked(inventoryRepo.atomicUpdateStock).mockResolvedValue({
            ...fakeVariant,
            stock: 50,
        });
        vi.mocked(inventoryRepo.createTransaction).mockResolvedValue(undefined);
        await inventoryService.adjustStock(fakeOperator, {
            variantId: FAKE_VARIANT_ID,
            actualStock: 50,
            reason: "Kiểm kho tháng 6",
        });
        // atomicUpdateStock phải được gọi với diff = 50 - 30 = +20
        expect(inventoryRepo.atomicUpdateStock).toHaveBeenCalledWith(fakeVariant._id, 20, expect.anything());
        expect(inventoryRepo.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ type: "adjustment", qty: 20 }), expect.anything());
    });
    it("ghi transaction với diff âm khi stock giảm", async () => {
        const fakeVariant = makeFakeVariant({ stock: 30 });
        vi.mocked(inventoryRepo.findVariantById).mockResolvedValue(fakeVariant);
        vi.mocked(inventoryRepo.atomicUpdateStock).mockResolvedValue({
            ...fakeVariant,
            stock: 10,
        });
        vi.mocked(inventoryRepo.createTransaction).mockResolvedValue(undefined);
        await inventoryService.adjustStock(fakeOperator, {
            variantId: FAKE_VARIANT_ID,
            actualStock: 10,
        });
        // atomicUpdateStock phải được gọi với diff = 10 - 30 = -20
        expect(inventoryRepo.atomicUpdateStock).toHaveBeenCalledWith(fakeVariant._id, -20, expect.anything());
        expect(inventoryRepo.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ qty: -20 }), expect.anything());
    });
    it("không ghi transaction nếu stock không thay đổi", async () => {
        const fakeVariant = makeFakeVariant({ stock: 30 });
        vi.mocked(inventoryRepo.findVariantById).mockResolvedValue(fakeVariant);
        await inventoryService.adjustStock(fakeOperator, {
            variantId: FAKE_VARIANT_ID,
            actualStock: 30,
        });
        expect(inventoryRepo.createTransaction).not.toHaveBeenCalled();
    });
    it("throw notFound khi variant không tồn tại", async () => {
        vi.mocked(inventoryRepo.findVariantById).mockResolvedValue(null);
        await expect(inventoryService.adjustStock(fakeOperator, {
            variantId: FAKE_VARIANT_ID,
            actualStock: 10,
        })).rejects.toMatchObject({ status: 404 });
    });
});
// ── createSupplier ────────────────────────────────────────────────────────────
describe("inventoryService.createSupplier", () => {
    it("tạo nhà cung cấp thành công với name và phone hợp lệ", async () => {
        const fakeSupplier = { _id: "s_id", name: "NCC A", phone: "0901234567" };
        vi.mocked(inventoryRepo.createSupplier).mockResolvedValue(fakeSupplier);
        const result = await inventoryService.createSupplier({
            name: "NCC A",
            phone: "0901234567",
        });
        expect(result.name).toBe("NCC A");
    });
    it("throw badRequest khi thiếu name hoặc phone", async () => {
        await expect(inventoryService.createSupplier({ name: "", phone: "" })).rejects.toMatchObject({ status: 400 });
    });
});
