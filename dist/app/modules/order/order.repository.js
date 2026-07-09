import Order from "./models/order.schema.js";
import Product from "../product/models/product.schema.js";
// ── Order ─────────────────────────────────────────────────────────────────────
export const findOrders = async (query, page, limit) => {
    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
        Order.find(query).sort({ _id: -1 }).skip(skip).limit(limit).lean(),
        Order.countDocuments(query),
    ]);
    const totalPages = Math.ceil(total / limit);
    return { orders, total, limit, page, totalPages };
};
export const countOrders = (query) => Order.countDocuments(query);
export const findOrderById = (id) => Order.findById(id);
export const findOne = (query) => Order.findOne(query);
export const findOrderByCode = (code) => Order.findOne({ code });
export const findOrdersByUserId = (userId) => Order.find({
    userId,
    note: { $ne: "System auto-cancelled due to payment timeout" }
}).sort({ createdAt: -1 }).lean();
export const createOrder = async (data, session) => {
    const result = await Order.create([data], { session });
    return result[0];
};
export const saveOrder = (order, session) => order.save({ session });
export const findOneAndUpdateOrder = (query, update, options) => Order.findOneAndUpdate(query, update, options);
// ── Product & Variant (stock management) ──────────────────────────────────────
export const findProductById = (id) => Product.findById(id).populate("categoryId", "name slug imageUrl isActive");
export const findProductsByIds = (ids) => Product.find({ _id: { $in: ids } }).populate("categoryId", "name slug imageUrl isActive");
export const findVariantById = async (id) => {
    const Variant = (await import("../product/models/variant.schema.js"))
        .default;
    return Variant.findById(id);
};
export const findVariantsByIds = async (ids) => {
    const Variant = (await import("../product/models/variant.schema.js"))
        .default;
    return Variant.find({ _id: { $in: ids } });
};
export const decrementVariantStock = async (variantId, quantity, session) => {
    const Variant = (await import("../product/models/variant.schema.js"))
        .default;
    const updated = await Variant.findOneAndUpdate({ _id: variantId, stock: { $gte: quantity } }, { $inc: { stock: -quantity } }, { session, returnDocument: "after" });
    if (!updated) {
        throw new Error("Không đủ số lượng trong tồn kho hoặc biến thể không tồn tại");
    }
    import("../inventory/inventory.service.js")
        .then(service => service.checkAndTriggerLowStockAlert(updated))
        .catch(err => console.error("Error triggering low stock alert:", err));
    return updated;
};
export const incrementVariantStock = async (variantId, quantity, session) => {
    const Variant = (await import("../product/models/variant.schema.js"))
        .default;
    return Variant.findByIdAndUpdate(variantId, { $inc: { stock: quantity } }, { session });
};
