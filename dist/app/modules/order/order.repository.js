import Order from "../../models/order/order.schema.js";
import Product from "../../models/product/product.schema.js";
// ── Order ─────────────────────────────────────────────────────────────────────
export const findOrders = async (query, cursor, limit) => {
    if (cursor) {
        query._id = { $lt: cursor };
    }
    const orders = await Order.find(query).sort({ _id: -1 }).limit(limit + 1).lean();
    const hasNextPage = orders.length > limit;
    const items = hasNextPage ? orders.slice(0, limit) : orders;
    const nextCursor = hasNextPage ? items[items.length - 1]._id.toString() : null;
    return { orders: items, nextCursor, hasNextPage, limit };
};
export const countOrders = (query) => Order.countDocuments(query);
export const findOrderById = (id) => Order.findById(id);
export const findOne = (query) => Order.findOne(query);
export const findOrderByCode = (code) => Order.findOne({ code });
export const findOrdersByUserId = (userId) => Order.find({
    userId,
    note: { $ne: "Hệ thống tự động hủy do quá hạn thanh toán" }
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
    const Variant = (await import("../../models/product/variant.schema.js"))
        .default;
    return Variant.findById(id);
};
export const findVariantsByIds = async (ids) => {
    const Variant = (await import("../../models/product/variant.schema.js"))
        .default;
    return Variant.find({ _id: { $in: ids } });
};
export const decrementVariantStock = async (variantId, quantity, session) => {
    const Variant = (await import("../../models/product/variant.schema.js"))
        .default;
    const updated = await Variant.findOneAndUpdate({ _id: variantId, stock: { $gte: quantity } }, { $inc: { stock: -quantity } }, { session, returnDocument: "after" });
    if (!updated) {
        throw new Error("Không đủ số lượng trong tồn kho hoặc biến thể không tồn tại");
    }
    return updated;
};
export const incrementVariantStock = async (variantId, quantity, session) => {
    const Variant = (await import("../../models/product/variant.schema.js"))
        .default;
    return Variant.findByIdAndUpdate(variantId, { $inc: { stock: quantity } }, { session });
};
