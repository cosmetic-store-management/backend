import Product from "../../models/product/product.schema.js";
import Variant from "../../models/product/variant.schema.js";
import Supplier from "../../models/inventory/supplier.schema.js";
import GoodsReceipt from "../../models/inventory/goods-receipt.schema.js";
import InventoryTransaction from "../../models/inventory/inventory-transaction.schema.js";
import Batch from "../../models/inventory/batch.schema.js";
// ── Supplier ──────────────────────────────────────────────────────────────────
export const findAllSuppliers = () => Supplier.find().sort({ name: 1 }).lean();
export const findSupplierById = (id) => Supplier.findById(id);
export const createSupplier = (data) => Supplier.create(data);
// ── Variant / Stock ───────────────────────────────────────────────────────────
export const findVariantsByQuery = async (query, cursor, limit) => {
    if (cursor)
        query._id = { $lt: cursor };
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
export const countVariantsByQuery = (query) => Variant.countDocuments(query);
export const findVariantById = (id) => Variant.findById(id);
export const findProductById = (id) => Product.findById(id);
export const saveVariant = (variant) => variant.save();
export const atomicUpdateStock = (id, quantity, session) => Variant.findByIdAndUpdate(id, { $inc: { stock: quantity } }, { returnDocument: "after", session });
/** Tìm tất cả ID product match tên tìm kiếm */
export const findProductIdsByName = async (search) => {
    const products = await Product.find({ name: { $regex: search.trim(), $options: "i" } }, "_id").lean();
    return products.map((p) => p._id);
};
// ── Inventory Transactions ────────────────────────────────────────────────────
export const findTransactions = async (cursor, limit, type) => {
    const query = {};
    if (type)
        query.type = type;
    if (cursor)
        query._id = { $lt: cursor };
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
export const countTransactions = (type) => {
    const query = type ? { type } : {};
    return InventoryTransaction.countDocuments(query);
};
export const createTransaction = (data, session) => {
    return new InventoryTransaction(data).save({ session });
};
// ── Goods Receipts ────────────────────────────────────────────────────────────
export const createGoodsReceipt = (data, session) => {
    return GoodsReceipt.create([data], { session }).then((docs) => docs[0]);
};
// ── Batch ─────────────────────────────────────────────────────────────────────
export const createBatch = (data, session) => Batch.create([data], { session }).then((docs) => docs[0]);
export const findActiveBatchesByVariant = (variantId, session) => Batch.find({ variantId, remainingQty: { $gt: 0 } })
    .sort({ expiryDate: 1, createdAt: 1 }) // FEFO: First Expire First Out
    .session(session || null);
export const findActiveBatchesByVariants = (variantIds) => Batch.find({ variantId: { $in: variantIds }, remainingQty: { $gt: 0 } }).lean();
export const updateBatchQuantity = (batchId, deductQty, session) => Batch.findByIdAndUpdate(batchId, { $inc: { remainingQty: -deductQty } }, { session });
export const updateBatchInfo = (batchId, data) => Batch.findByIdAndUpdate(batchId, { $set: data }, { new: true });
export const deductBatchesFIFO = async (variantId, deductQty, session) => {
    const batches = await findActiveBatchesByVariant(variantId, session);
    let remainingToDeduct = deductQty;
    let totalCost = 0;
    for (const batch of batches) {
        if (remainingToDeduct <= 0)
            break;
        const available = batch.remainingQty;
        const deductAmount = Math.min(available, remainingToDeduct);
        batch.remainingQty -= deductAmount;
        await Batch.updateOne({ _id: batch._id }, { $inc: { remainingQty: -deductAmount } }, { session });
        totalCost += deductAmount * (batch.importPrice || 0);
        remainingToDeduct -= deductAmount;
    }
    // If there's still quantity to deduct but no batches left, we just assume cost is 0 for the remainder,
    // or we could throw an error. But to prevent blocking orders due to inventory mismatch,
    // we just calculate whatever batches we have.
    return totalCost;
};
// ── Low Stock ─────────────────────────────────────────────────────────────────
export const findLowStockVariants = (limit = 10) => Variant.find({ $expr: { $lte: ["$stock", "$minStock"] } }).limit(limit);
