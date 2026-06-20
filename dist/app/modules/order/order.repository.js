import Order from "../../models/order.schema.js";
import Product from "../../models/product.schema.js";
// ── Order ─────────────────────────────────────────────────────────────────────
export const findOrders = (query, skip, limit) => Order.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
export const countOrders = (query) => Order.countDocuments(query);
export const findOrderById = (id) => Order.findById(id);
export const findOne = (query) => Order.findOne(query);
export const findOrderByCode = (code) => Order.findOne({ code });
export const findOrdersByUserId = (userId) => Order.find({ userId }).sort({ createdAt: -1 }).lean();
export const createOrder = (data) => Order.create(data);
export const saveOrder = (order) => order.save();
// ── Product & Variant (stock management) ──────────────────────────────────────
export const findProductById = (id) => Product.findById(id).populate("categoryId", "name slug imageUrl isActive");
export const findVariantById = async (id) => {
    const Variant = (await import("../../models/variant.schema.js")).default;
    return Variant.findById(id);
};
export const decrementVariantStock = async (variantId, quantity) => {
    const Variant = (await import("../../models/variant.schema.js")).default;
    const updated = await Variant.findOneAndUpdate({ _id: variantId, stock: { $gte: quantity } }, { $inc: { stock: -quantity } }, { returnDocument: "after" });
    if (!updated) {
        throw new Error("Không đủ số lượng trong tồn kho hoặc biến thể không tồn tại");
    }
    return updated;
};
export const incrementVariantStock = async (variantId, quantity) => {
    const Variant = (await import("../../models/variant.schema.js")).default;
    return Variant.findByIdAndUpdate(variantId, { $inc: { stock: quantity } });
};
