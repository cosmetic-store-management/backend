/**
 * inventory.repository.ts
 * Data access layer cho Inventory module.
 * Service chỉ chứa business logic, repo lo query DB.
 */
import mongoose from "mongoose";
import Product from "../../models/product/product.schema.js";
import Variant from "../../models/product/variant.schema.js";
import Supplier from "../../models/inventory/supplier.schema.js";
import GoodsReceipt from "../../models/inventory/goods-receipt.schema.js";
import InventoryTransaction from "../../models/inventory/inventory-transaction.schema.js";
import Batch from "../../models/inventory/batch.schema.js";

// ── Supplier ──────────────────────────────────────────────────────────────────

export const findAllSuppliers = () => Supplier.find().sort({ name: 1 }).lean();

export const findSupplierById = (id: string) => Supplier.findById(id);

export const createSupplier = (data: any) => Supplier.create(data);

// ── Variant / Stock ───────────────────────────────────────────────────────────

export const findVariantsByQuery = async (
  query: Record<string, any>,
  cursor: string | null,
  limit: number,
) => {
  if (cursor) query._id = { $lt: cursor };
  const variants = await Variant.find(query)
    .populate({
      path: "productId",
      populate: { path: "brandId", select: "name slug imageUrl country" },
    })
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();

  const hasNextPage = variants.length > limit;
  const items = hasNextPage ? variants.slice(0, limit) : variants;
  const nextCursor = hasNextPage ? items[items.length - 1]._id.toString() : null;

  return { variants: items, nextCursor, hasNextPage, limit };
};

export const countVariantsByQuery = (query: Record<string, any>) =>
  Variant.countDocuments(query);

export const findVariantById = (id: string) => Variant.findById(id);

export const findProductById = (id: string) => Product.findById(id);

export const saveVariant = (variant: any) => variant.save();

export const atomicUpdateStock = (
  id: string | mongoose.Types.ObjectId,
  quantity: number,
  session?: mongoose.ClientSession,
) =>
  Variant.findByIdAndUpdate(
    id,
    { $inc: { stock: quantity } },
    { returnDocument: "after", session },
  );

/** Tìm tất cả ID product match tên tìm kiếm */
export const findProductIdsByName = async (
  search: string,
): Promise<mongoose.Types.ObjectId[]> => {
  const products = await Product.find(
    { name: { $regex: search.trim(), $options: "i" } },
    "_id",
  ).lean();
  return products.map((p: any) => p._id);
};

// ── Inventory Transactions ────────────────────────────────────────────────────

export const findTransactions = async (cursor: string | null, limit: number, type?: string) => {
  const query: any = {};
  if (type) query.type = type;
  if (cursor) query._id = { $lt: cursor };

  const transactions = await InventoryTransaction.find(query)
    .populate({
      path: "variantId",
      populate: { path: "productId", select: "name" },
    })
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();

  const hasNextPage = transactions.length > limit;
  const items = hasNextPage ? transactions.slice(0, limit) : transactions;
  const nextCursor = hasNextPage ? items[items.length - 1]._id.toString() : null;

  return { transactions: items, nextCursor, hasNextPage, limit };
};

export const countTransactions = (type?: string) => {
  const query = type ? { type } : {};
  return InventoryTransaction.countDocuments(query);
};

export const createTransaction = (
  data: {
    code: string;
    productId: any;
    variantId: any;
    type: "in" | "out" | "adjustment";
    qty: number;
    creatorId: any;
    date: Date;
  },
  session?: mongoose.ClientSession,
) => {
  return new InventoryTransaction(data).save({ session });
};

// ── Goods Receipts ────────────────────────────────────────────────────────────

export const createGoodsReceipt = (
  data: {
    code: string;
    supplierId: mongoose.Types.ObjectId;
    items: any[];
    totalAmount: number;
    creatorId: any;
  },
  session?: mongoose.ClientSession,
) => {
  return GoodsReceipt.create([data], { session }).then((docs) => docs[0]);
};

// ── Batch ─────────────────────────────────────────────────────────────────────

export const createBatch = (
  data: any,
  session?: mongoose.ClientSession,
) => Batch.create([data], { session }).then((docs) => docs[0]);

export const findActiveBatchesByVariant = (
  variantId: string | mongoose.Types.ObjectId,
  session?: mongoose.ClientSession,
) =>
  Batch.find({ variantId, remainingQty: { $gt: 0 } })
    .sort({ expiryDate: 1, createdAt: 1 }) // FEFO: First Expire First Out
    .session(session || null);

export const findActiveBatchesByVariants = (
  variantIds: (string | mongoose.Types.ObjectId)[],
) => Batch.find({ variantId: { $in: variantIds }, remainingQty: { $gt: 0 } }).lean();

export const updateBatchQuantity = (
  batchId: string | mongoose.Types.ObjectId,
  deductQty: number,
  session?: mongoose.ClientSession,
) =>
  Batch.findByIdAndUpdate(
    batchId,
    { $inc: { remainingQty: -deductQty } },
    { session },
  );

export const updateBatchInfo = (
  batchId: string | mongoose.Types.ObjectId,
  data: { batchCode?: string; manufactureDate?: Date; expiryDate?: Date; importPrice?: number },
) => Batch.findByIdAndUpdate(batchId, { $set: data }, { new: true });

export const deductBatchesFIFO = async (
  variantId: string | mongoose.Types.ObjectId,
  deductQty: number,
  session?: mongoose.ClientSession,
): Promise<number> => {
  const batches = await findActiveBatchesByVariant(variantId, session);
  let remainingToDeduct = deductQty;
  let totalCost = 0;

  for (const batch of batches) {
    if (remainingToDeduct <= 0) break;

    const available = batch.remainingQty;
    const deductAmount = Math.min(available, remainingToDeduct);
    
    batch.remainingQty -= deductAmount;
    await Batch.updateOne(
      { _id: batch._id },
      { $inc: { remainingQty: -deductAmount } },
      { session }
    );
    
    totalCost += deductAmount * (batch.importPrice || 0);
    remainingToDeduct -= deductAmount;
  }

  // If there's still quantity to deduct but no batches left, we just assume cost is 0 for the remainder,
  // or we could throw an error. But to prevent blocking orders due to inventory mismatch,
  // we just calculate whatever batches we have.
  return totalCost;
};

// ── Low Stock ─────────────────────────────────────────────────────────────────

export const findLowStockVariants = (limit = 10) =>
  Variant.find({ $expr: { $lte: ["$stock", "$minStock"] } }).limit(limit);
