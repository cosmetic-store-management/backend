/**
 * report.repository.ts
 * Data access layer cho Report/Dashboard module.
 * Tập trung toàn bộ aggregate queries phức tạp vào đây để service gọn + dễ test.
 *
 * Performance:
 *   - allowDiskUse: true  → tránh OOM với dataset lớn
 *   - In-memory cache TTL 5 phút → dashboard không cần realtime tuyệt đối
 */
import mongoose from "mongoose";
import Order from "../order/models/order.schema.js";
import Product from "../product/models/product.schema.js";
import User from "../user/models/user.schema.js";
import Category from "../category/models/category.schema.js";

// Ensure Category schema is registered in Mongoose and not optimized away
const _categoryModel = Category;

type DateFilter = { createdAt?: { $gte?: Date; $lte?: Date } };

// ── In-memory cache (TTL 5 phút) ─────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 phút

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function cacheKey(fn: string, ...args: unknown[]): string {
  return `${fn}:${JSON.stringify(args)}`;
}

function getCached<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached<T>(key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Xoá toàn bộ cache — gọi sau khi có đơn hàng mới / cập nhật */
export function invalidateReportCache(): void {
  cache.clear();
}

/** Wrapper: nếu đã cache thì trả về, nếu chưa thì gọi fn và cache kết quả */
async function withCache<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = getCached<T>(key);
  if (hit !== null) return hit;
  const result = await fn();
  setCached(key, result);
  return result;
}

// ── Aggregate options ─────────────────────────────────────────────────────────

const AGG_OPTIONS = { allowDiskUse: true } as const;

// ── Revenue & Orders ──────────────────────────────────────────────────────────

export const aggregateRevenue = (dateFilter: DateFilter) => {
  const key = cacheKey("aggregateRevenue", dateFilter);
  return withCache(key, async () => {
    const orders = await Order.aggregate(
      [
        { $match: { orderStatus: { $in: ["completed", "returned"] }, ...dateFilter } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$totalAmount" },
            totalCost: { $sum: "$totalCost" },
            count: { $sum: 1 },
          },
        },
      ],
      AGG_OPTIONS,
    );

    const PaymentTransaction = (await import("../order/models/payment-transaction.schema.js")).default;
    const refundDateFilter: any = {};
    if (dateFilter && dateFilter.completedAt) {
      refundDateFilter.createdAt = dateFilter.completedAt;
    }
    const refunds = await PaymentTransaction.aggregate(
      [
        { $match: { type: "refund", status: { $in: ["success", "pending"] }, ...refundDateFilter } },
        { $group: { _id: null, totalRefunded: { $sum: "$amount" } } }
      ],
      AGG_OPTIONS
    );

    const returnedOrdersFilter: any = {};
    if (dateFilter && dateFilter.completedAt) {
      returnedOrdersFilter.returnedAt = dateFilter.completedAt;
    }
    const returnedOrders = await Order.aggregate(
      [
        { $match: { orderStatus: "returned", ...returnedOrdersFilter } },
        { $group: { _id: null, totalReturnedCost: { $sum: "$totalCost" } } }
      ],
      AGG_OPTIONS
    );

    const totalSales = orders[0]?.totalRevenue || 0;
    const totalCost = orders[0]?.totalCost || 0;
    const count = orders[0]?.count || 0;
    const totalRefunded = refunds[0]?.totalRefunded || 0;
    const totalReturnedCost = returnedOrders[0]?.totalReturnedCost || 0;

    return [{
      totalRevenue: Math.max(0, totalSales - totalRefunded),
      totalCost: Math.max(0, totalCost - totalReturnedCost),
      count
    }];
  });
};

export const countOrders = (dateFilter: DateFilter) =>
  Order.countDocuments({ orderStatus: { $in: ["completed", "returned"] }, ...dateFilter });

export const aggregateSoldProducts = (dateFilter: DateFilter) => {
  const key = cacheKey("aggregateSoldProducts", dateFilter);
  return withCache(key, () =>
    Order.aggregate(
      [
        { $match: { orderStatus: { $in: ["completed", "returned"] }, ...dateFilter } },
        { $unwind: "$items" },
        { $group: { _id: null, totalSold: { $sum: "$items.quantity" } } },
      ],
      AGG_OPTIONS,
    ),
  );
};

export const countCustomers = (dateFilter: DateFilter) =>
  User.countDocuments({ role: "customer", ...dateFilter });

/** Thống kê cùng kỳ trước để tính % thay đổi */
export const aggregateRevenueForPeriod = (start: Date, end: Date) => {
  const key = cacheKey("aggregateRevenueForPeriod", start, end);
  return withCache(key, async () => {
    const orders = await Order.aggregate(
      [
        {
          $match: {
            orderStatus: { $in: ["completed", "returned"] },
            completedAt: { $gte: start, $lte: end },
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
      ],
      AGG_OPTIONS,
    );

    const PaymentTransaction = (await import("../order/models/payment-transaction.schema.js")).default;
    const refunds = await PaymentTransaction.aggregate(
      [
        {
          $match: {
            type: "refund",
            status: { $in: ["success", "pending"] },
            createdAt: { $gte: start, $lte: end },
          },
        },
        { $group: { _id: null, totalRefunded: { $sum: "$amount" } } }
      ],
      AGG_OPTIONS
    );

    const returnedOrders = await Order.aggregate(
      [
        {
          $match: {
            orderStatus: "returned",
            returnedAt: { $gte: start, $lte: end },
          },
        },
        { $group: { _id: null, totalReturnedCost: { $sum: "$totalCost" } } }
      ],
      AGG_OPTIONS
    );

    const totalSales = orders[0]?.totalRevenue || 0;
    const totalCost = orders[0]?.totalCost || 0;
    const count = orders[0]?.count || 0;
    const totalRefunded = refunds[0]?.totalRefunded || 0;
    const totalReturnedCost = returnedOrders[0]?.totalReturnedCost || 0;

    return [{
      totalRevenue: Math.max(0, totalSales - totalRefunded),
      totalCost: Math.max(0, totalCost - totalReturnedCost),
      count
    }];
  });
};

export const countOrdersForPeriod = (start: Date, end: Date) =>
  Order.countDocuments({ 
    orderStatus: { $in: ["completed", "returned"] },
    completedAt: { $gte: start, $lte: end }
  });

export const countCustomersForPeriod = (start: Date, end: Date) =>
  User.countDocuments({
    role: "customer",
    createdAt: { $gte: start, $lte: end },
  });

// ── Recent Orders ─────────────────────────────────────────────────────────────

export const findRecentOrders = (dateFilter: DateFilter, limit: number = 5) => {
  const key = cacheKey("findRecentOrders", dateFilter, limit);
  return withCache(key, () =>
    Order.find({
      ...dateFilter,
      note: { $ne: "System auto-cancelled due to payment timeout" }
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
  );
};

// ── Top Selling Products ──────────────────────────────────────────────────────

export const aggregateTopProducts = (dateFilter: DateFilter, limit = 5) => {
  const key = cacheKey("aggregateTopProducts", dateFilter, limit);
  return withCache(key, () =>
    Order.aggregate(
      [
        { $match: { orderStatus: { $in: ["completed", "returned"] }, ...dateFilter } },
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
      ],
      AGG_OPTIONS,
    ),
  );
};

export const findProductById = (id: mongoose.Types.ObjectId | string) =>
  Product.findById(id).populate("categoryId").lean();

// ── Low Stock ─────────────────────────────────────────────────────────────────

export const findLowStockVariants = async (limit = 10) => {
  const Variant = (await import("../product/models/variant.schema.js"))
    .default;
  return Variant.find({ $expr: { $lte: ["$stock", "$minStock"] } })
    .limit(limit)
    .lean();
};

export const findVariantsByProductId = async (
  productId: mongoose.Types.ObjectId,
) => {
  const Variant = (await import("../product/models/variant.schema.js"))
    .default;
  return Variant.find({ productId }).lean();
};

// ── Completion Rates ──────────────────────────────────────────────────────────

export const aggregateCompletionRates = (dateFilter: DateFilter) => {
  const key = cacheKey("aggregateCompletionRates", dateFilter);
  return withCache(key, () =>
    Order.aggregate(
      [
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
      ],
      AGG_OPTIONS,
    ),
  );
};

// ── Revenue Chart ─────────────────────────────────────────────────────────────

export const aggregateRevenueChart = (dateFilter: DateFilter) => {
  const key = cacheKey("aggregateRevenueChart", dateFilter);
  return withCache(key, () =>
    Order.aggregate(
      [
        { $match: { orderStatus: { $in: ["completed", "returned"] }, ...dateFilter } },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$completedAt",
                timezone: "Asia/Ho_Chi_Minh",
              },
            },
            revenue: { $sum: "$totalAmount" },
            orders: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ],
      AGG_OPTIONS,
    ),
  );
};

// ── Category Performance ──────────────────────────────────────────────────────

export const aggregateCategoryPerformance = (dateFilter: DateFilter) => {
  const key = cacheKey("aggregateCategoryPerformance", dateFilter);
  return withCache(key, () =>
    Order.aggregate(
      [
        { $match: { orderStatus: { $in: ["completed", "returned"] }, ...dateFilter } },
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
      ],
      AGG_OPTIONS,
    ),
  );
};

// ── Payment Methods ───────────────────────────────────────────────────────────

export const aggregatePaymentMethods = (dateFilter: DateFilter) => {
  const key = cacheKey("aggregatePaymentMethods", dateFilter);
  return withCache(key, () =>
    Order.aggregate(
      [
        { $match: { orderStatus: { $in: ["completed", "returned"] }, ...dateFilter } },
        {
          $group: {
            _id: "$paymentMethod",
            count: { $sum: 1 },
            revenue: {
              $sum: {
                $cond: [
                  { $in: ["$orderStatus", ["completed", "returned"]] },
                  "$totalAmount",
                  0,
                ],
              },
            },
          },
        },
        { $sort: { count: -1 } },
      ],
      AGG_OPTIONS,
    ),
  );
};

export const aggregateChannelStats = (dateFilter: DateFilter) => {
  const key = cacheKey("aggregateChannelStats", dateFilter);
  return withCache(key, async () => {
    const orders = await Order.aggregate(
      [
        { $match: { orderStatus: { $in: ["completed", "returned"] }, ...dateFilter } },
        {
          $group: {
            _id: "$channel",
            totalRevenue: { $sum: "$totalAmount" },
            totalCost: { $sum: "$totalCost" },
            count: { $sum: 1 },
          },
        },
      ],
      AGG_OPTIONS,
    );

    const PaymentTransaction = (await import("../order/models/payment-transaction.schema.js")).default;
    const refundDateFilter: any = {};
    if (dateFilter && dateFilter.completedAt) {
      refundDateFilter.createdAt = dateFilter.completedAt;
    }
    const refundsByChannel = await PaymentTransaction.aggregate(
      [
        { $match: { type: "refund", status: { $in: ["success", "pending"] }, ...refundDateFilter } },
        {
          $lookup: {
            from: "orders",
            localField: "orderId",
            foreignField: "_id",
            as: "order"
          }
        },
        { $unwind: "$order" },
        {
          $group: {
            _id: "$order.channel",
            totalRefunded: { $sum: "$amount" }
          }
        }
      ],
      AGG_OPTIONS
    );

    const returnedOrdersFilter: any = {};
    if (dateFilter && dateFilter.completedAt) {
      returnedOrdersFilter.returnedAt = dateFilter.completedAt;
    }
    const returnedCostsByChannel = await Order.aggregate(
      [
        { $match: { orderStatus: "returned", ...returnedOrdersFilter } },
        {
          $group: {
            _id: "$channel",
            totalReturnedCost: { $sum: "$totalCost" }
          }
        }
      ],
      AGG_OPTIONS
    );

    return orders.map((o: any) => {
      const refundObj = refundsByChannel.find((r: any) => r._id === o._id);
      const retCostObj = returnedCostsByChannel.find((rc: any) => rc._id === o._id);
      const refundAmt = refundObj?.totalRefunded || 0;
      const retCost = retCostObj?.totalReturnedCost || 0;

      return {
        _id: o._id,
        totalRevenue: Math.max(0, o.totalRevenue - refundAmt),
        totalCost: Math.max(0, o.totalCost - retCost),
        count: o.count
      };
    });
  });
};

// ── Voucher Stats ─────────────────────────────────────────────────────────────

export const findAllVouchers = async (dateFilter: DateFilter) => {
  const Voucher = (await import("../voucher/models/voucher.schema.js"))
    .default;
  return Voucher.find(dateFilter).lean();
};
