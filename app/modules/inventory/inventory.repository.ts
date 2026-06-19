/**
 * inventory.repository.ts
 * Data access layer cho Inventory module.
 * Service chỉ chứa business logic, repo lo query DB.
 */
import mongoose from "mongoose";
import Product from "../../models/product.schema.js";
import Variant from "../../models/variant.schema.js";
import Supplier from "../../models/supplier.schema.js";
import GoodsReceipt from "../../models/goods-receipt.schema.js";
import InventoryTransaction from "../../models/inventory-transaction.schema.js";

// ── Supplier ──────────────────────────────────────────────────────────────────

export const findAllSuppliers = () =>
  Supplier.find().sort({ name: 1 }).lean();

export const findSupplierById = (id: string) =>
  Supplier.findById(id);

export const createSupplier = (data: any) =>
  Supplier.create(data);

// ── Variant / Stock ───────────────────────────────────────────────────────────

export const findVariantsByQuery = (
  query: Record<string, any>,
  skip: number,
  limit: number
) =>
  Variant.find(query)
    .populate({
      path: "productId",
      populate: { path: "brandId", select: "name slug imageUrl country" },
    })
    .sort({ stock: 1 })
    .skip(skip)
    .limit(limit)
    .lean();

export const countVariantsByQuery = (query: Record<string, any>) =>
  Variant.countDocuments(query);

export const findVariantById = (id: string) =>
  Variant.findById(id);

export const findProductById = (id: string) =>
  Product.findById(id);

export const saveVariant = (variant: any) =>
  variant.save();

/** Tìm tất cả ID product match tên tìm kiếm */
export const findProductIdsByName = async (search: string): Promise<mongoose.Types.ObjectId[]> => {
  const products = await Product.find(
    { name: { $regex: search.trim(), $options: "i" } },
    "_id"
  ).lean();
  return products.map((p: any) => p._id);
};

// ── Inventory Transactions ────────────────────────────────────────────────────

export const findTransactions = (skip: number, limit: number) =>
  InventoryTransaction.find()
    .populate("variantId")
    .populate("creatorId", "name email")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

export const countTransactions = () =>
  InventoryTransaction.countDocuments();

export const createTransaction = (data: {
  code:       string;
  productId:  any;
  variantId:  any;
  type:       "in" | "out" | "adjustment";
  qty:        number;
  creatorId:  any;
  date:       Date;
}) => InventoryTransaction.create(data);

// ── Goods Receipts ────────────────────────────────────────────────────────────

export const createGoodsReceipt = (data: {
  code:        string;
  supplierId:  mongoose.Types.ObjectId;
  items:       any[];
  totalAmount: number;
  creatorId:   any;
}) => GoodsReceipt.create(data);

// ── Low Stock ─────────────────────────────────────────────────────────────────

export const findLowStockVariants = (limit = 10) =>
  Variant.find({ $expr: { $lte: ["$stock", "$minStock"] } }).limit(limit);
