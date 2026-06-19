import Order, { type OrderDocument, type IOrder } from "../../models/order.schema.js";
import Product from "../../models/product.schema.js";
import mongoose, { type Types } from "mongoose";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = Record<string, any>;

// ── Order ─────────────────────────────────────────────────────────────────────

export const findOrders = (query: Query, skip: number, limit: number) =>
  Order.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();

export const countOrders = (query: Query) =>
  Order.countDocuments(query);

export const findOrderById = (id: string) =>
  Order.findById(id);

export const findOne = (query: Query) =>
  Order.findOne(query);

export const findOrderByCode = (code: string) =>
  Order.findOne({ code });

export const findOrdersByUserId = (userId: string | Types.ObjectId) =>
  Order.find({ userId }).sort({ createdAt: -1 }).lean();

export const createOrder = (data: Partial<IOrder>) =>
  Order.create(data);

export const saveOrder = (order: OrderDocument) =>
  order.save();

// ── Product & Variant (stock management) ──────────────────────────────────────

export const findProductById = (id: string) =>
  Product.findById(id).populate("categoryId", "name slug imageUrl isActive");

export const findVariantById = async (id: string) => {
  const Variant = (await import("../../models/variant.schema.js")).default;
  return Variant.findById(id);
};

export const decrementVariantStock = async (variantId: string, quantity: number) => {
  const Variant = (await import("../../models/variant.schema.js")).default;
  const updated = await Variant.findOneAndUpdate(
    { _id: variantId, stock: { $gte: quantity } },
    { $inc: { stock: -quantity } },
    { returnDocument: "after" }
  );
  if (!updated) {
    throw new Error("Không đủ số lượng trong tồn kho hoặc biến thể không tồn tại");
  }
  return updated;
};

export const incrementVariantStock = async (variantId: string, quantity: number) => {
  const Variant = (await import("../../models/variant.schema.js")).default;
  return Variant.findByIdAndUpdate(variantId, { $inc: { stock: quantity } });
};
