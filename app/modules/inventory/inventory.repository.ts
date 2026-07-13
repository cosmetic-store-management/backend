/**
 * inventory.repository.ts
 * Data access layer cho Inventory module.
 * Service chỉ chứa business logic, repo lo query DB.
 */
import mongoose from "mongoose";
import Product from "../product/models/product.schema.js";
import Variant from "../product/models/variant.schema.js";
import Supplier from "./models/supplier.schema.js";
import GoodsReceipt from "./models/goods-receipt.schema.js";
import InventoryTransaction from "./models/inventory-transaction.schema.js";
import Batch from "./models/batch.schema.js";
import Stocktake from "./models/stocktake.schema.js";

// ── Supplier ──────────────────────────────────────────────────────────────────

export const findAllSuppliers = () => Supplier.find().sort({ name: 1 }).lean();

export const findSupplierById = (id: string) => Supplier.findById(id);

export const createSupplier = (data: any) => Supplier.create(data);

// ── Variant / Stock ───────────────────────────────────────────────────────────

export const findVariantsByQuery = async (
  query: Record<string, any>,
  page: number,
  limit: number,
) => {
  const skip = (page - 1) * limit;
  const [variants, total] = await Promise.all([
    Variant.find(query)
      .populate({
        path: "productId",
        populate: {
          path: "brandId",
          select: "name slug imageUrl country supplierId",
          populate: { path: "supplierId" },
        },
      })
      .sort({ _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Variant.countDocuments(query),
  ]);

  const totalPages = Math.ceil(total / limit);

  return { variants, total, limit, page, totalPages };
};

export const countVariantsByQuery = (query: Record<string, any>) =>
  Variant.countDocuments(query);

export const findVariantById = (id: string) => Variant.findById(id);

export const findProductById = (id: string) => Product.findById(id);

export const saveVariant = (variant: any) => variant.save();

export const atomicUpdateStock = async (
  id: string | mongoose.Types.ObjectId,
  quantity: number,
  session?: mongoose.ClientSession,
) => {
  const updated = await Variant.findByIdAndUpdate(
    id,
    { $inc: { stock: quantity } },
    { returnDocument: "after", session },
  );

  if (updated && quantity < 0) {
    import("./inventory.service.js")
      .then(service => service.checkAndTriggerLowStockAlert(updated))
      .catch(err => console.error("Error triggering low stock alert:", err));
  }

  return updated;
};

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

export const findTransactions = async (page: number, limit: number, type?: string, variantId?: string) => {
  const query: any = {};
  if (variantId) {
    query.variantId = variantId;
  }
  if (type) {
    if (type === "customer_return") {
      query.code = { $regex: /^TXRET/ };
    } else if (type === "in") {
      query.type = "in";
      query.code = { $regex: /^(?!TXRET)/ };
    } else {
      query.type = type;
    }
  }

  const skip = (page - 1) * limit;

  const [transactions, total] = await Promise.all([
    InventoryTransaction.find(query)
      .populate({
        path: "variantId",
        populate: { path: "productId", select: "name imageUrl imageUrls" },
      })
      .populate("creatorId", "name")
      .sort({ _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    InventoryTransaction.countDocuments(query),
  ]);

  const totalPages = Math.ceil(total / limit);

  return { transactions, total, limit, page, totalPages };
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
    price?: number;
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

    // Use atomic findOneAndUpdate with an aggregation pipeline to deduct remainingQty safely
    const updatedBatch = await Batch.findOneAndUpdate(
      { _id: batch._id, remainingQty: { $gt: 0 } },
      [
        {
          $set: {
            remainingQty: {
              $max: [0, { $subtract: ["$remainingQty", remainingToDeduct] }]
            }
          }
        }
      ],
      { session, new: false, updatePipeline: true } // return old document so we know the previous remainingQty
    );

    if (updatedBatch) {
      const oldRemaining = updatedBatch.remainingQty;
      const deducted = Math.min(oldRemaining, remainingToDeduct);
      
      totalCost += deducted * (batch.importPrice || 0);
      remainingToDeduct -= deducted;
    }
  }

  // If there's still quantity to deduct but no batches left, we just assume cost is 0 for the remainder,
  // or we could throw an error. But to prevent blocking orders due to inventory mismatch,
  // we just calculate whatever batches we have.
  return totalCost;
};

// ── Low Stock ─────────────────────────────────────────────────────────────────

export const findLowStockVariants = (limit = 10) =>
  Variant.find({ $expr: { $lte: ["$stock", "$minStock"] } }).limit(limit);

export const aggregateTotalInventoryValue = async () => {
  const result = await Batch.aggregate([
    { $match: { remainingQty: { $gt: 0 } } },
    { $group: { _id: null, totalValue: { $sum: { $multiply: ["$remainingQty", "$importPrice"] } } } }
  ]);
  return result[0]?.totalValue || 0;
};

export const countTotalSKUs = () => Variant.countDocuments({ isDeleted: { $ne: true } });

export const countOutOfStock = () => Variant.countDocuments({ stock: 0, isDeleted: { $ne: true } });

export const countLowStock = () =>
  Variant.countDocuments({
    $expr: { $lte: ["$stock", "$minStock"] },
    stock: { $gt: 0 },
    isDeleted: { $ne: true }
  });

// ── Goods Receipts Query ──────────────────────────────────────────────────────

export const findGoodsReceipts = async (page: number, limit: number, query: any = {}) => {
  const skip = (page - 1) * limit;
  const [receipts, total] = await Promise.all([
    GoodsReceipt.find(query)
      .populate("supplierId", "name phone email contactPerson")
      .populate("creatorId", "name")
      .populate("items.productId", "name imageUrl imageUrls")
      .populate("items.variantId", "barcode sku imageUrl")
      .sort({ _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    GoodsReceipt.countDocuments(query),
  ]);
  const totalPages = Math.ceil(total / limit);
  return { receipts, total, limit, page, totalPages };
};

export const findGoodsReceiptById = (id: string) =>
  GoodsReceipt.findById(id)
    .populate("supplierId", "name phone email address contactPerson")
    .populate("creatorId", "name")
    .populate("items.productId", "name imageUrl imageUrls")
    .populate("items.variantId", "barcode sku imageUrl")
    .lean();

// ── Stocktakes Query ──────────────────────────────────────────────────────────

export const createStocktake = (data: any, session?: mongoose.ClientSession) =>
  Stocktake.create([data], { session }).then((docs) => docs[0]);

export const findStocktakes = async (page: number, limit: number, query: any = {}) => {
  const skip = (page - 1) * limit;
  const [stocktakes, total] = await Promise.all([
    Stocktake.find(query)
      .populate("creatorId", "name")
      .sort({ _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Stocktake.countDocuments(query),
  ]);
  const totalPages = Math.ceil(total / limit);
  return { stocktakes, total, limit, page, totalPages };
};

export const findStocktakeById = (id: string) =>
  Stocktake.findById(id)
    .populate("creatorId", "name")
    .lean();
