import Order from "../../models/order.schema.js";
import Product from "../../models/product.schema.js";
import User from "../../models/user.schema.js";
// ── Revenue & Orders ──────────────────────────────────────────────────────────
export const aggregateRevenue = (dateFilter) => Order.aggregate([
    { $match: { orderStatus: "completed", ...dateFilter } },
    { $group: { _id: null, totalRevenue: { $sum: "$totalAmount" }, count: { $sum: 1 } } }
]);
export const countOrders = (dateFilter) => Order.countDocuments(dateFilter);
export const aggregateSoldProducts = (dateFilter) => Order.aggregate([
    { $match: { orderStatus: "completed", ...dateFilter } },
    { $unwind: "$items" },
    { $group: { _id: null, totalSold: { $sum: "$items.quantity" } } }
]);
export const countCustomers = (dateFilter) => User.countDocuments({ role: "customer", ...dateFilter });
/** Thống kê cùng kỳ trước để tính % thay đổi */
export const aggregateRevenueForPeriod = (start, end) => Order.aggregate([
    { $match: { orderStatus: "completed", createdAt: { $gte: start, $lte: end } } },
    { $group: { _id: null, totalRevenue: { $sum: "$totalAmount" }, count: { $sum: 1 } } }
]);
export const countOrdersForPeriod = (start, end) => Order.countDocuments({ createdAt: { $gte: start, $lte: end } });
export const countCustomersForPeriod = (start, end) => User.countDocuments({ role: "customer", createdAt: { $gte: start, $lte: end } });
// ── Recent Orders ─────────────────────────────────────────────────────────────
export const findRecentOrders = (dateFilter, limit = 5) => Order.find(dateFilter).sort({ createdAt: -1 }).limit(limit).lean();
// ── Top Selling Products ──────────────────────────────────────────────────────
export const aggregateTopProducts = (dateFilter, limit = 5) => Order.aggregate([
    { $match: { orderStatus: "completed", ...dateFilter } },
    { $unwind: "$items" },
    { $group: { _id: "$items.productId", sold: { $sum: "$items.quantity" } } },
    { $sort: { sold: -1 } },
    { $limit: limit }
]);
export const findProductById = (id) => Product.findById(id).populate("categoryId").lean();
// ── Low Stock ─────────────────────────────────────────────────────────────────
export const findLowStockVariants = async (limit = 10) => {
    const Variant = (await import("../../models/variant.schema.js")).default;
    return Variant.find({ $expr: { $lte: ["$stock", "$minStock"] } }).limit(limit).lean();
};
export const findVariantsByProductId = async (productId) => {
    const Variant = (await import("../../models/variant.schema.js")).default;
    return Variant.find({ productId }).lean();
};
// ── Completion Rates ──────────────────────────────────────────────────────────
export const aggregateCompletionRates = (dateFilter) => Order.aggregate([
    { $match: dateFilter },
    {
        $group: {
            _id: null,
            total: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ["$orderStatus", "completed"] }, 1, 0] } },
            cancelled: { $sum: { $cond: [{ $eq: ["$orderStatus", "cancelled"] }, 1, 0] } },
            processing: { $sum: { $cond: [{ $in: ["$orderStatus", ["pending", "processing", "shipping"]] }, 1, 0] } }
        }
    }
]);
// ── Revenue Chart ─────────────────────────────────────────────────────────────
export const aggregateRevenueChart = (dateFilter) => Order.aggregate([
    { $match: { orderStatus: "completed", ...dateFilter } },
    {
        $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Ho_Chi_Minh" } },
            revenue: { $sum: "$totalAmount" },
            orders: { $sum: 1 }
        }
    },
    { $sort: { "_id": 1 } }
]);
// ── Category Performance ──────────────────────────────────────────────────────
export const aggregateCategoryPerformance = (dateFilter) => Order.aggregate([
    { $match: { orderStatus: "completed", ...dateFilter } },
    { $unwind: "$items" },
    { $lookup: { from: "products", localField: "items.productId", foreignField: "_id", as: "product" } },
    { $unwind: "$product" },
    { $lookup: { from: "categories", localField: "product.categoryId", foreignField: "_id", as: "category" } },
    { $unwind: "$category" },
    {
        $group: {
            _id: "$category.name",
            revenue: { $sum: "$items.lineTotal" },
            sold: { $sum: "$items.quantity" }
        }
    },
    { $sort: { revenue: -1 } }
]);
// ── Payment Methods ───────────────────────────────────────────────────────────
export const aggregatePaymentMethods = (dateFilter) => Order.aggregate([
    { $match: dateFilter },
    {
        $group: {
            _id: "$paymentMethod",
            count: { $sum: 1 },
            revenue: { $sum: { $cond: [{ $eq: ["$orderStatus", "completed"] }, "$totalAmount", 0] } }
        }
    },
    { $sort: { count: -1 } }
]);
// ── Voucher Stats ─────────────────────────────────────────────────────────────
export const findAllVouchers = async (dateFilter) => {
    const Voucher = (await import("../../models/voucher.schema.js")).default;
    return Voucher.find(dateFilter).lean();
};
