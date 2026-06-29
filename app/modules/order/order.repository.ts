import Order, {
  type OrderDocument,
  type IOrder,
} from "./models/order.schema.js";
import Product from "../product/models/product.schema.js";
import mongoose, { type Types } from "mongoose";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = Record<string, any>;

// ── Order ─────────────────────────────────────────────────────────────────────

export const findOrders = async (query: Query, cursor: string | null, limit: number) => {
  if (cursor) {
    query._id = { $lt: cursor };
  }
  const orders = await Order.find(query).sort({ _id: -1 }).limit(limit + 1).lean();
  
  const hasNextPage = orders.length > limit;
  const items = hasNextPage ? orders.slice(0, limit) : orders;
  const nextCursor = hasNextPage ? items[items.length - 1]._id.toString() : null;

  return { orders: items, nextCursor, hasNextPage, limit };
};

export const countOrders = (query: Query) => Order.countDocuments(query);

export const findOrderById = (id: string) => Order.findById(id);

export const findOne = (query: Query) => Order.findOne(query);

export const findOrderByCode = (code: string) => Order.findOne({ code });

export const findOrdersByUserId = (userId: string | Types.ObjectId) =>
  Order.find({ 
    userId,
    note: { $ne: "Hệ thống tự động hủy do quá hạn thanh toán" }
  }).sort({ createdAt: -1 }).lean();

export const createOrder = async (data: Partial<IOrder>, session?: mongoose.ClientSession) => {
  const result = await Order.create([data], { session });
  return result[0];
};

export const saveOrder = (order: OrderDocument, session?: mongoose.ClientSession) => order.save({ session });

export const findOneAndUpdateOrder = (query: Query, update: any, options?: any) => Order.findOneAndUpdate(query, update, options);

// ── Product & Variant (stock management) ──────────────────────────────────────

export const findProductById = (id: string) =>
  Product.findById(id).populate("categoryId", "name slug imageUrl isActive");

export const findProductsByIds = (ids: string[]) =>
  Product.find({ _id: { $in: ids } }).populate("categoryId", "name slug imageUrl isActive");

export const findVariantById = async (id: string) => {
  const Variant = (await import("../product/models/variant.schema.js"))
    .default;
  return Variant.findById(id);
};

export const findVariantsByIds = async (ids: string[]) => {
  const Variant = (await import("../product/models/variant.schema.js"))
    .default;
  return Variant.find({ _id: { $in: ids } });
};

export const decrementVariantStock = async (
  variantId: string,
  quantity: number,
  session?: mongoose.ClientSession
) => {
  const Variant = (await import("../product/models/variant.schema.js"))
    .default;
  const updated = await Variant.findOneAndUpdate(
    { _id: variantId, stock: { $gte: quantity } },
    { $inc: { stock: -quantity } },
    { session, returnDocument: "after" },
  );
  if (!updated) {
    throw new Error(
      "Không đủ số lượng trong tồn kho hoặc biến thể không tồn tại",
    );
  }
  return updated;
};

export const incrementVariantStock = async (
  variantId: string,
  quantity: number,
  session?: mongoose.ClientSession
) => {
  const Variant = (await import("../product/models/variant.schema.js"))
    .default;
  return Variant.findByIdAndUpdate(
    variantId, 
    { $inc: { stock: quantity } },
    { session }
  );
};
