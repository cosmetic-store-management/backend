import { injectable, container } from "tsyringe";
import Order, {
  type OrderDocument,
  type IOrder,
} from "./models/order.schema.js";
import Product from "../../catalog/product/models/product.schema.js";
import mongoose, { type Types } from "mongoose";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = Record<string, any>;

@injectable()
export class OrderRepository {
  async findOrders(query: Query, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [orderIds, total] = await Promise.all([
      Order.find(query).select("_id").sort({ _id: -1 }).skip(skip).limit(limit).lean(),
      Order.countDocuments(query),
    ]);
    
    let orders: any[] = [];
    if (orderIds.length > 0) {
      const ids = orderIds.map((o: any) => o._id);
      orders = await Order.find({ _id: { $in: ids } }).sort({ _id: -1 }).lean();
    }
    
    const totalPages = Math.ceil(total / limit);

    return { orders, total, limit, page, totalPages };
  }

  countOrders(query: Query) {
    return Order.countDocuments(query);
  }

  findOrderById(id: string) {
    return Order.findById(id);
  }

  findOne(query: Query) {
    return Order.findOne(query);
  }

  findOrderByCode(code: string) {
    return Order.findOne({ code });
  }

  findOrdersByUserId(userId: string | Types.ObjectId) {
    return Order.find({ 
      userId,
      note: { $ne: "System auto-cancelled due to payment timeout" }
    }).sort({ createdAt: -1 }).lean();
  }

  async createOrder(data: Partial<IOrder>, session?: mongoose.ClientSession) {
    const result = await Order.create([data], { session });
    return result[0];
  }

  saveOrder(order: OrderDocument, session?: mongoose.ClientSession) {
    return order.save({ session });
  }

  findOneAndUpdateOrder(query: Query, update: any, options?: any) {
    return Order.findOneAndUpdate(query, update, options);
  }

  async aggregateUserTotalSpent(userId: string | Types.ObjectId): Promise<number> {
    const [result] = await Order.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId.toString()),
          orderStatus: "completed",
        },
      },
      { $group: { _id: null, totalSpent: { $sum: "$totalAmount" } } },
    ]);
    return result?.totalSpent ?? 0;
  }

  countOrdersToday(startOfDay: Date, endOfDay: Date): Promise<number> {
    return Order.countDocuments({
      createdAt: { $gte: startOfDay, $lte: endOfDay },
    });
  }

  async getCollaborativeProductIds(productId: string | mongoose.Types.ObjectId, limit: number): Promise<string[]> {
    const pId = new mongoose.Types.ObjectId(productId.toString());
    const ordersAggregation = await Order.aggregate([
      { $match: { "items.productId": pId } },
      { $unwind: "$items" },
      { $match: { "items.productId": { $ne: pId } } },
      { $group: { _id: "$items.productId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit }
    ]);
    return ordersAggregation.map((doc: any) => doc._id.toString());
  }

  findProductById(id: string) {
    return Product.findById(id).populate("categoryId", "name slug imageUrl isActive");
  }

  async findProductsByIds(ids: string[]) {
    return Product.find({ _id: { $in: ids } }).populate("categoryId", "name slug imageUrl isActive");
  }

  async incrementProductSoldCount(productId: string, quantity: number, session?: mongoose.ClientSession) {
    return Product.findByIdAndUpdate(
      productId,
      { $inc: { soldCount: quantity } },
      { session }
    );
  }

  async findVariantById(id: string) {
    const Variant = (await import("../../catalog/product/models/variant.schema.js"))
      .default;
    return Variant.findById(id);
  }

  async findVariantsByIds(ids: string[]) {
    const Variant = (await import("../../catalog/product/models/variant.schema.js"))
      .default;
    return Variant.find({ _id: { $in: ids } });
  }

  async decrementVariantStock(
    variantId: string,
    quantity: number,
    session?: mongoose.ClientSession
  ) {
    const Variant = (await import("../../catalog/product/models/variant.schema.js"))
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
    
    import("../../shared/event-bus/index.js")
      .then(({ eventBus }) => {
        eventBus.emit("inventory.stock.decremented", updated);
      })
      .catch(err => console.error("Error emitting inventory.stock.decremented:", err));

    return updated;
  }

  async incrementVariantStock(
    variantId: string,
    quantity: number,
    session?: mongoose.ClientSession
  ) {
    const Variant = (await import("../../catalog/product/models/variant.schema.js"))
      .default;
    return Variant.findByIdAndUpdate(
      variantId, 
      { $inc: { stock: quantity } },
      { session }
    );
  }

  async hasCompletedPurchase(
    userId: string | mongoose.Types.ObjectId,
    productId: string | mongoose.Types.ObjectId,
  ): Promise<boolean> {
    const exists = await Order.exists({
      userId,
      orderStatus: "completed",
      "items.productId": productId,
    });
    return !!exists;
  }

  async getLatestCompletedOrderItem(
    userId: string | mongoose.Types.ObjectId,
    productId: string | mongoose.Types.ObjectId,
  ) {
    const order = await Order.findOne({
      userId,
      orderStatus: "completed",
      "items.productId": productId,
    })
      .sort({ completedAt: -1, createdAt: -1 })
      .lean();

    return order?.items.find((item: any) => item.productId.toString() === productId.toString()) || null;
  }
}
