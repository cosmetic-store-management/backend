import Order from "../order/models/order.schema.js";
import Product from "../product/models/product.schema.js";
import User from "../user/models/user.schema.js";
// ── In-memory cache (TTL 5 phút) ─────────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 phút
const cache = new Map();
function cacheKey(fn, ...args) {
    return `${fn}:${JSON.stringify(args)}`;
}
function getCached(key) {
    const entry = cache.get(key);
    if (!entry)
        return null;
    if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        return null;
    }
    return entry.data;
}
function setCached(key, data) {
    cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}
/** Xoá toàn bộ cache — gọi sau khi có đơn hàng mới / cập nhật */
export function invalidateReportCache() {
    cache.clear();
}
/** Wrapper: nếu đã cache thì trả về, nếu chưa thì gọi fn và cache kết quả */
async function withCache(key, fn) {
    const hit = getCached(key);
    if (hit !== null)
        return hit;
    const result = await fn();
    setCached(key, result);
    return result;
}
// ── Aggregate options ─────────────────────────────────────────────────────────
const AGG_OPTIONS = { allowDiskUse: true };
// ── Revenue & Orders ──────────────────────────────────────────────────────────
export const aggregateRevenue = (dateFilter) => {
    const key = cacheKey("aggregateRevenue", dateFilter);
    return withCache(key, () => Order.aggregate([
        { $match: { orderStatus: "completed", ...dateFilter } },
        {
            $group: {
                _id: null,
                totalRevenue: { $sum: "$totalAmount" },
                totalCost: { $sum: "$totalCost" },
                count: { $sum: 1 },
            },
        },
    ], AGG_OPTIONS));
};
export const countOrders = (dateFilter) => Order.countDocuments(dateFilter);
export const aggregateSoldProducts = (dateFilter) => {
    const key = cacheKey("aggregateSoldProducts", dateFilter);
    return withCache(key, () => Order.aggregate([
        { $match: { orderStatus: "completed", ...dateFilter } },
        { $unwind: "$items" },
        { $group: { _id: null, totalSold: { $sum: "$items.quantity" } } },
    ], AGG_OPTIONS));
};
export const countCustomers = (dateFilter) => User.countDocuments({ role: "customer", ...dateFilter });
/** Thống kê cùng kỳ trước để tính % thay đổi */
export const aggregateRevenueForPeriod = (start, end) => {
    const key = cacheKey("aggregateRevenueForPeriod", start, end);
    return withCache(key, () => Order.aggregate([
        {
            $match: {
                orderStatus: "completed",
                createdAt: { $gte: start, $lte: end },
            },
        },
        {
            $group: {
                _id: null,
                totalRevenue: { $sum: "$totalAmount" },
                totalCost: { $sum: "$totalCost" },
                count: { $sum: 1 },
            },
        },
    ], AGG_OPTIONS));
};
export const countOrdersForPeriod = (start, end) => Order.countDocuments({
    createdAt: { $gte: start, $lte: end },
    note: { $ne: "System auto-cancelled due to payment timeout" }
});
export const countCustomersForPeriod = (start, end) => User.countDocuments({
    role: "customer",
    createdAt: { $gte: start, $lte: end },
});
// ── Recent Orders ─────────────────────────────────────────────────────────────
export const findRecentOrders = (dateFilter, limit = 5) => {
    const key = cacheKey("findRecentOrders", dateFilter, limit);
    return withCache(key, () => Order.find({
        ...dateFilter,
        note: { $ne: "System auto-cancelled due to payment timeout" }
    })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean());
};
// ── Top Selling Products ──────────────────────────────────────────────────────
export const aggregateTopProducts = (dateFilter, limit = 5) => {
    const key = cacheKey("aggregateTopProducts", dateFilter, limit);
    return withCache(key, () => Order.aggregate([
        { $match: { orderStatus: "completed", ...dateFilter } },
        { $unwind: "$items" },
        {
            $addFields: {
                "items.productId": {
                    $cond: {
                        if: { $eq: [{ $type: "$items.productId" }, "string"] },
                        then: { $toObjectId: "$items.productId" },
                        else: "$items.productId",
                    },
                },
            },
        },
        {
            $group: {
                _id: "$items.productId",
                sold: { $sum: "$items.quantity" },
            },
        },
        { $sort: { sold: -1 } },
        { $limit: limit },
    ], AGG_OPTIONS));
};
export const findProductById = (id) => Product.findById(id).populate("categoryId").lean();
// ── Low Stock ─────────────────────────────────────────────────────────────────
export const findLowStockVariants = async (limit = 10) => {
    const Variant = (await import("../product/models/variant.schema.js"))
        .default;
    return Variant.find({ $expr: { $lte: ["$stock", "$minStock"] } })
        .limit(limit)
        .lean();
};
export const findVariantsByProductId = async (productId) => {
    const Variant = (await import("../product/models/variant.schema.js"))
        .default;
    return Variant.find({ productId }).lean();
};
// ── Completion Rates ──────────────────────────────────────────────────────────
export const aggregateCompletionRates = (dateFilter) => {
    const key = cacheKey("aggregateCompletionRates", dateFilter);
    return withCache(key, () => Order.aggregate([
        { $match: dateFilter },
        {
            $group: {
                _id: null,
                total: { $sum: 1 },
                completed: {
                    $sum: { $cond: [{ $eq: ["$orderStatus", "completed"] }, 1, 0] },
                },
                cancelled: {
                    $sum: { $cond: [{ $eq: ["$orderStatus", "cancelled"] }, 1, 0] },
                },
                processing: {
                    $sum: {
                        $cond: [
                            {
                                $in: [
                                    "$orderStatus",
                                    ["pending", "processing", "shipping"],
                                ],
                            },
                            1,
                            0,
                        ],
                    },
                },
                returned: {
                    $sum: {
                        $cond: [
                            {
                                $in: [
                                    "$orderStatus",
                                    ["returned", "return_pending"],
                                ],
                            },
                            1,
                            0,
                        ],
                    },
                },
            },
        },
    ], AGG_OPTIONS));
};
// ── Revenue Chart ─────────────────────────────────────────────────────────────
export const aggregateRevenueChart = (dateFilter) => {
    const key = cacheKey("aggregateRevenueChart", dateFilter);
    return withCache(key, () => Order.aggregate([
        { $match: { orderStatus: "completed", ...dateFilter } },
        {
            $group: {
                _id: {
                    $dateToString: {
                        format: "%Y-%m-%d",
                        date: "$createdAt",
                        timezone: "Asia/Ho_Chi_Minh",
                    },
                },
                revenue: { $sum: "$totalAmount" },
                orders: { $sum: 1 },
            },
        },
        { $sort: { _id: 1 } },
    ], AGG_OPTIONS));
};
// ── Category Performance ──────────────────────────────────────────────────────
export const aggregateCategoryPerformance = (dateFilter) => {
    const key = cacheKey("aggregateCategoryPerformance", dateFilter);
    return withCache(key, () => Order.aggregate([
        { $match: { orderStatus: "completed", ...dateFilter } },
        { $unwind: "$items" },
        {
            $addFields: {
                "items.productId": {
                    $cond: {
                        if: { $eq: [{ $type: "$items.productId" }, "string"] },
                        then: { $toObjectId: "$items.productId" },
                        else: "$items.productId",
                    },
                },
            },
        },
        {
            $lookup: {
                from: "products",
                localField: "items.productId",
                foreignField: "_id",
                as: "product",
            },
        },
        { $unwind: "$product" },
        {
            $lookup: {
                from: "categories",
                localField: "product.categoryId",
                foreignField: "_id",
                as: "category",
            },
        },
        { $unwind: "$category" },
        {
            $graphLookup: {
                from: "categories",
                startWith: "$category.parentId",
                connectFromField: "parentId",
                connectToField: "_id",
                as: "ancestors",
            },
        },
        {
            $addFields: {
                rootCategory: {
                    $let: {
                        vars: {
                            foundRoot: {
                                $arrayElemAt: [
                                    {
                                        $filter: {
                                            input: "$ancestors",
                                            as: "cat",
                                            cond: { $eq: ["$$cat.parentId", null] },
                                        },
                                    },
                                    0,
                                ],
                            },
                        },
                        in: { $ifNull: ["$$foundRoot", "$category"] },
                    },
                },
            },
        },
        {
            $group: {
                _id: "$rootCategory.name",
                revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
                sold: { $sum: "$items.quantity" },
            },
        },
        { $sort: { revenue: -1 } },
    ], AGG_OPTIONS));
};
// ── Payment Methods ───────────────────────────────────────────────────────────
export const aggregatePaymentMethods = (dateFilter) => {
    const key = cacheKey("aggregatePaymentMethods", dateFilter);
    return withCache(key, () => Order.aggregate([
        { $match: dateFilter },
        {
            $group: {
                _id: "$paymentMethod",
                count: { $sum: 1 },
                revenue: {
                    $sum: {
                        $cond: [
                            { $eq: ["$orderStatus", "completed"] },
                            "$totalAmount",
                            0,
                        ],
                    },
                },
            },
        },
        { $sort: { count: -1 } },
    ], AGG_OPTIONS));
};
export const aggregateChannelStats = (dateFilter) => {
    const key = cacheKey("aggregateChannelStats", dateFilter);
    return withCache(key, () => Order.aggregate([
        { $match: { orderStatus: "completed", ...dateFilter } },
        {
            $group: {
                _id: "$channel",
                totalRevenue: { $sum: "$totalAmount" },
                totalCost: { $sum: "$totalCost" },
                count: { $sum: 1 },
            },
        },
    ], AGG_OPTIONS));
};
// ── Voucher Stats ─────────────────────────────────────────────────────────────
export const findAllVouchers = async (dateFilter) => {
    const Voucher = (await import("../voucher/models/voucher.schema.js"))
        .default;
    return Voucher.find(dateFilter).lean();
};
