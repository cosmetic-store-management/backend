import Product from "../../models/product.schema.js";
import Variant from "../../models/variant.schema.js";
import Supplier from "../../models/supplier.schema.js";
import GoodsReceipt from "../../models/goods-receipt.schema.js";
import InventoryTransaction from "../../models/inventory-transaction.schema.js";
// ── Supplier ──────────────────────────────────────────────────────────────────
export const findAllSuppliers = () => Supplier.find().sort({ name: 1 }).lean();
export const findSupplierById = (id) => Supplier.findById(id);
export const createSupplier = (data) => Supplier.create(data);
// ── Variant / Stock ───────────────────────────────────────────────────────────
export const findVariantsByQuery = (query, skip, limit) => Variant.find(query)
    .populate({
    path: "productId",
    populate: { path: "brandId", select: "name slug imageUrl country" },
})
    .sort({ stock: 1 })
    .skip(skip)
    .limit(limit)
    .lean();
export const countVariantsByQuery = (query) => Variant.countDocuments(query);
export const findVariantById = (id) => Variant.findById(id);
export const findProductById = (id) => Product.findById(id);
export const saveVariant = (variant) => variant.save();
/** Tìm tất cả ID product match tên tìm kiếm */
export const findProductIdsByName = async (search) => {
    const products = await Product.find({ name: { $regex: search.trim(), $options: "i" } }, "_id").lean();
    return products.map((p) => p._id);
};
// ── Inventory Transactions ────────────────────────────────────────────────────
export const findTransactions = (skip, limit) => InventoryTransaction.find()
    .populate("variantId")
    .populate("creatorId", "name email")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
export const countTransactions = () => InventoryTransaction.countDocuments();
export const createTransaction = (data) => InventoryTransaction.create(data);
// ── Goods Receipts ────────────────────────────────────────────────────────────
export const createGoodsReceipt = (data) => GoodsReceipt.create(data);
// ── Low Stock ─────────────────────────────────────────────────────────────────
export const findLowStockVariants = (limit = 10) => Variant.find({ $expr: { $lte: ["$stock", "$minStock"] } }).limit(limit);
