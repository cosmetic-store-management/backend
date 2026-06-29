/**
 * inventory.integration.test.ts — Integration tests cho Inventory Service + Repository
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  connectTestDB,
  disconnectTestDB,
  clearCollections,
} from "./helpers/db-helper.js";
import * as inventoryService from "../../app/modules/inventory/inventory.service.js";
import mongoose from "mongoose";
import Supplier from "../../app/modules/inventory/models/supplier.schema.js";
import Variant from "../../app/modules/product/models/variant.schema.js";
import Product from "../../app/modules/product/models/product.schema.js";
import Category from "../../app/modules/category/models/category.schema.js";
import User from "../../app/modules/user/models/user.schema.js";
import InventoryTransaction from "../../app/modules/inventory/models/inventory-transaction.schema.js";

let variantId: string;
let supplierId: string;
let operator: any;

beforeAll(async () => {
  await connectTestDB();
});
afterAll(async () => {
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearCollections();

  const category = await Category.create({
    name: "Skincare",
    slug: "skincare",
    isActive: true,
  });
  const product = await Product.create({
    name: "Kem dưỡng",
    slug: "kem-duong",
    categoryId: category._id,
    brandId: new mongoose.Types.ObjectId(),
    isActive: true,
    imageUrl: "x.jpg",
  });

  const variant = await Variant.create({
    productId: product._id,
    name: "50ml",
    sku: "SKU1",
    price: 100_000,
    stock: 30,
    minStock: 10,
  });
  variantId = variant._id.toString();

  const supplier = await Supplier.create({
    name: "Nhà cung cấp A",
    phone: "0901234567",
  });
  supplierId = supplier._id.toString();

  const user = await User.create({
    name: "Staff",
    phone: "0999999999",
    role: "staff",
  });
  operator = user;
});

// ── createSupplier ────────────────────────────────────────────────────────────

describe("[Integration] Inventory — createSupplier", () => {
  it("tạo nhà cung cấp mới và lưu vào DB", async () => {
    const result = await inventoryService.createSupplier({
      name: "NCC Mới",
      phone: "0912345678",
    });
    expect(result.name).toBe("NCC Mới");

    const inDB = await Supplier.findOne({ name: "NCC Mới" });
    expect(inDB).not.toBeNull();
  });
});

// ── createGoodsReceipt ────────────────────────────────────────────────────────

describe("[Integration] Inventory — createGoodsReceipt", () => {
  it("nhập kho cộng stock vào variant và tạo transaction", async () => {
    const receipt = await inventoryService.createGoodsReceipt(operator, {
      supplierId,
      items: [{ variantId, quantity: 20, importPrice: 50_000 }],
    });

    expect(receipt.totalAmount).toBe(1_000_000); // 20 * 50_000

    // Stock phải tăng từ 30 → 50
    const updatedVariant = await Variant.findById(variantId);
    expect(updatedVariant?.stock).toBe(50);

    // Phải có transaction "in" trong DB
    const tx = await InventoryTransaction.findOne({ type: "in", qty: 20 });
    expect(tx).not.toBeNull();
  });

  it("throw notFound khi supplier không tồn tại", async () => {
    await expect(
      inventoryService.createGoodsReceipt(operator, {
        supplierId: "000000000000000000000000",
        items: [{ variantId, quantity: 5, importPrice: 10_000 }],
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ── adjustStock ───────────────────────────────────────────────────────────────

describe("[Integration] Inventory — adjustStock", () => {
  it("kiểm kho cập nhật stock đúng và ghi transaction adjustment", async () => {
    await inventoryService.adjustStock(operator, {
      variantId,
      actualStock: 25,
    });

    const updatedVariant = await Variant.findById(variantId);
    expect(updatedVariant?.stock).toBe(25);

    // Transaction adjustment phải có qty = -5 (25 - 30)
    const tx = await InventoryTransaction.findOne({ type: "adjustment" });
    expect(tx?.qty).toBe(-5);
  });

  it("không tạo transaction khi stock không thay đổi", async () => {
    await inventoryService.adjustStock(operator, {
      variantId,
      actualStock: 30,
    }); // không đổi

    const txCount = await InventoryTransaction.countDocuments();
    expect(txCount).toBe(0);
  });
});
