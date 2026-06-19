/**
 * report.repository.ts
 * Data access layer cho Report/Dashboard module.
 * Tập trung toàn bộ aggregate queries phức tạp vào đây để service gọn + dễ test.
 */
import mongoose from "mongoose";
import Order from "../../models/order.schema.js";
import Product from "../../models/product.schema.js";
import User from "../../models/user.schema.js";

type DateFilter = { createdAt?: { $gte?: Date; $lte?: Date } };

// ── Revenue & Orders ──────────────────────────────────────────────────────────

export const aggregateRevenue = (dateFilter: DateFilter) =>
  Order.aggregate([
    { $match: { orderStatus: "completed", ...dateFilter } },
    { $group: { _id: null, totalRevenue: { $sum: "$totalAmount" }, count: { $sum: 1 } } }
  ]);

export const countOrders = (dateFilter: DateFilter) =>
  Order.countDocuments(dateFilter);

export const aggregateSoldProducts = (dateFilter: DateFilter) =>
  Order.aggregate([
    { $match: { orderStatus: "completed", ...dateFilter } },
    { $unwind: "$items" },
    { $group: { _id: null, totalSold: { $sum: "$items.quantity" } } }
  ]);

export const countCustomers = (dateFilter: DateFilter) =>
  User.countDocuments({ role: "customer", ...dateFilter });

/** Thống kê cùng kỳ trước để tính % thay đổi */
export const aggregateRevenueForPeriod = (start: Date, end: Date) =>
  Order.aggregate([
    { $match: { orderStatus: "completed", createdAt: { $gte: start, $lte: end } } },
    { $group: { _id: null, totalRevenue: { $sum: "$totalAmount" }, count: { $sum: 1 } } }
  ]);

export const countOrdersForPeriod = (start: Date, end: Date) =>
  Order.countDocuments({ createdAt: { $gte: start, $lte: end } });

export const countCustomersForPeriod = (start: Date, end: Date) =>
  User.countDocuments({ role: "customer", createdAt: { $gte: start, $lte: end } });

// ── Recent Orders ─────────────────────────────────────────────────────────────

export const findRecentOrders = (dateFilter: DateFilter, limit = 5) =>
  Order.find(dateFilter).sort({ createdAt: -1 }).limit(limit).lean();

// ── Top Selling Products ──────────────────────────────────────────────────────

export const aggregateTopProducts = (dateFilter: DateFilter, limit = 5) =>
  Order.aggregate([
    { $match: { orderStatus: "completed", ...dateFilter } },
    { $unwind: "$items" },
    { $group: { _id: "$items.productId", sold: { $sum: "$items.quantity" } } },
    { $sort: { sold: -1 } },
    { $limit: limit }
  ]);

export const findProductById = (id: mongoose.Types.ObjectId | string) =>
  Product.findById(id).populate("categoryId").lean();

// ── Low Stock ─────────────────────────────────────────────────────────────────

export const findLowStockVariants = async (limit = 10) => {
  const Variant = (await import("../../models/variant.schema.js")).default;
  return Variant.find({ $expr: { $lte: ["$stock", "$minStock"] } }).limit(limit).lean();
};

export const findVariantsByProductId = async (productId: mongoose.Types.ObjectId) => {
  const Variant = (await import("../../models/variant.schema.js")).default;
  return Variant.find({ productId }).lean();
};

// ── Completion Rates ──────────────────────────────────────────────────────────

export const aggregateCompletionRates = (dateFilter: DateFilter) =>
  Order.aggregate([
    { $match: dateFilter },
    {
      $group: {
        _id: null,
        total:      { $sum: 1 },
        completed:  { $sum: { $cond: [{ $eq: ["$orderStatus", "completed"] }, 1, 0] } },
        cancelled:  { $sum: { $cond: [{ $eq: ["$orderStatus", "cancelled"] }, 1, 0] } },
        processing: { $sum: { $cond: [{ $in: ["$orderStatus", ["pending", "processing", "shipping"]] }, 1, 0] } }
      }
    }
  ]);

// ── Revenue Chart ─────────────────────────────────────────────────────────────

export const aggregateRevenueChart = (dateFilter: DateFilter) =>
  Order.aggregate([
    { $match: { orderStatus: "completed", ...dateFilter } },
    {
      $group: {
        _id:     { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Ho_Chi_Minh" } },
        revenue: { $sum: "$totalAmount" },
        orders:  { $sum: 1 }
      }
    },
    { $sort: { "_id": 1 } }
  ]);

// ── Category Performance ──────────────────────────────────────────────────────

export const aggregateCategoryPerformance = (dateFilter: DateFilter) =>
  Order.aggregate([
    { $match: { orderStatus: "completed", ...dateFilter } },
    { $unwind: "$items" },
    { $lookup: { from: "products", localField: "items.productId", foreignField: "_id", as: "product" } },
    { $unwind: "$product" },
    { $lookup: { from: "categories", localField: "product.categoryId", foreignField: "_id", as: "category" } },
    { $unwind: "$category" },
    {
      $group: {
        _id:     "$category.name",
        revenue: { $sum: "$items.lineTotal" },
        sold:    { $sum: "$items.quantity" }
      }
    },
    { $sort: { revenue: -1 } }
  ]);

// ── Payment Methods ───────────────────────────────────────────────────────────

export const aggregatePaymentMethods = (dateFilter: DateFilter) =>
  Order.aggregate([
    { $match: dateFilter },
    {
      $group: {
        _id:     "$paymentMethod",
        count:   { $sum: 1 },
        revenue: { $sum: { $cond: [{ $eq: ["$orderStatus", "completed"] }, "$totalAmount", 0] } }
      }
    },
    { $sort: { count: -1 } }
  ]);

// ── Voucher Stats ─────────────────────────────────────────────────────────────

export const findAllVouchers = async (dateFilter: DateFilter) => {
  const Voucher = (await import("../../models/voucher.schema.js")).default;
  return Voucher.find(dateFilter).lean();
};
