import * as reportRepo from "./report.repository.js";

// ── Helper: % thay đổi so với kỳ trước ───────────────────────────────────────

function calcChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100 * 10) / 10;
}

function buildDateFilter(startDate?: string, endDate?: string) {
  const filter: any = {};
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate)   filter.createdAt.$lte = new Date(endDate);
  }
  return filter;
}

/**
 * Tính "kỳ trước" đối xứng với kỳ hiện tại.
 * Ví dụ: kỳ 7 ngày → trả về start/end của 7 ngày trước.
 * Nếu không có filter → dùng 30 ngày gần nhất so với 30 ngày trước đó.
 */
function getPreviousPeriod(startDate?: string, endDate?: string): { prevStart: Date; prevEnd: Date } {
  const now   = new Date();
  const end   = endDate   ? new Date(endDate)   : now;
  const start = startDate ? new Date(startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const duration   = end.getTime() - start.getTime();
  const prevEnd    = new Date(start.getTime() - 1); // 1ms trước start
  const prevStart  = new Date(prevEnd.getTime() - duration);

  return { prevStart, prevEnd };
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export const getDashboardStats = async (startDate?: string, endDate?: string) => {
  const dateFilter  = buildDateFilter(startDate, endDate);
  const { prevStart, prevEnd } = getPreviousPeriod(startDate, endDate);

  // --- Kỳ hiện tại ---
  const [
    revenueResult,
    totalOrdersCount,
    soldProductsResult,
    totalCustomersCount,
    recentOrdersRaw,
    topProductsAgg,
    lowStockRaw,
  ] = await Promise.all([
    reportRepo.aggregateRevenue(dateFilter),
    reportRepo.countOrders(dateFilter),
    reportRepo.aggregateSoldProducts(dateFilter),
    reportRepo.countCustomers(dateFilter),
    reportRepo.findRecentOrders(dateFilter, 5),
    reportRepo.aggregateTopProducts(dateFilter, 5),
    reportRepo.findLowStockVariants(10),
  ]);

  // --- Kỳ trước (để tính % thay đổi) ---
  const [
    prevRevenueResult,
    prevOrdersCount,
    prevCustomersCount,
  ] = await Promise.all([
    reportRepo.aggregateRevenueForPeriod(prevStart, prevEnd),
    reportRepo.countOrdersForPeriod(prevStart, prevEnd),
    reportRepo.countCustomersForPeriod(prevStart, prevEnd),
  ]);

  const totalRevenue    = revenueResult[0]?.totalRevenue || 0;
  const totalSoldProducts = soldProductsResult[0]?.totalSold || 0;
  const prevRevenue     = prevRevenueResult[0]?.totalRevenue || 0;

  // ── Recent Orders ──────────────────────────────────────────────────────────
  const recentOrders = recentOrdersRaw.map((o) => {
    const diffMs    = Date.now() - new Date((o as any).createdAt).getTime();
    const diffMins  = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    let dateStr     = "Vừa xong";
    if (diffHours > 0) dateStr = `${diffHours} giờ trước`;
    else if (diffMins > 0) dateStr = `${diffMins} phút trước`;

    const statusMap: Record<string, string> = {
      completed: "Hoàn thành",
      shipping:  "Đang giao",
      cancelled: "Đã huỷ",
    };

    return {
      id:       o.code,
      customer: o.receiverName,
      items:    (o.items || []).map((item: any) => `${item.productName} (x${item.quantity})`).join(", "),
      total:    `${o.totalAmount.toLocaleString("vi-VN")}₫`,
      status:   statusMap[o.orderStatus] ?? "Chờ xử lý",
      date:     dateStr,
    };
  });

  // ── Top Products ───────────────────────────────────────────────────────────
  const topProducts = [];
  for (const agg of topProductsAgg) {
    const prod = await reportRepo.findProductById(agg._id);
    if (prod) {
      const variants  = await reportRepo.findVariantsByProductId(prod._id);
      const totalStock = variants.reduce((sum, v) => sum + v.stock, 0);

      topProducts.push({
        name:       prod.name,
        category:   (prod.categoryId as any)?.name ?? "Mỹ phẩm",
        sold:       agg.sold,
        stock:      totalStock,
        // % real: sold / total_sold_in_period (không còn hardcode /500)
        percentage: totalSoldProducts > 0
          ? Math.min(Math.round((agg.sold / totalSoldProducts) * 100), 100)
          : 0,
      });
    }
  }

  // ── Low Stock ──────────────────────────────────────────────────────────────
  const lowStockItems = await Promise.all(
    lowStockRaw.map(async (v) => {
      const prod = await reportRepo.findProductById(v.productId as any);
      return {
        productName: prod?.name || "Sản phẩm không rõ",
        variantName: v.name,
        sku:         v.sku,
        stock:       v.stock,
        minStock:    v.minStock,
      };
    })
  );

  return {
    stats: {
      totalRevenue,
      revenueChange:   calcChange(totalRevenue, prevRevenue),           // % thực từ DB
      ordersCount:     totalOrdersCount,
      ordersChange:    calcChange(totalOrdersCount, prevOrdersCount),   // % thực từ DB
      soldProducts:    totalSoldProducts,
      newCustomers:    totalCustomersCount,
      customersChange: calcChange(totalCustomersCount, prevCustomersCount), // % thực từ DB
      profit:          Math.round(totalRevenue * 0.35),
      averageOrderValue: totalOrdersCount > 0 ? Math.round(totalRevenue / totalOrdersCount) : 0,
    },
    recentOrders,
    topProducts,
    lowStockItems,
  };
};

// ── Completion Rates ──────────────────────────────────────────────────────────

export const getCompletionRates = async (startDate?: string, endDate?: string) => {
  const dateFilter = buildDateFilter(startDate, endDate);
  const result = await reportRepo.aggregateCompletionRates(dateFilter);

  if (result.length === 0) {
    return { total: 0, completed: 0, cancelled: 0, processing: 0, completedRate: 0, cancelledRate: 0 };
  }

  const data = result[0];
  return {
    total:          data.total,
    completed:      data.completed,
    cancelled:      data.cancelled,
    processing:     data.processing,
    completedRate:  Math.round((data.completed / data.total) * 100 * 100) / 100,
    cancelledRate:  Math.round((data.cancelled / data.total) * 100 * 100) / 100,
  };
};

// ── Revenue Chart ─────────────────────────────────────────────────────────────

export const getRevenueChart = async (startDate?: string, endDate?: string) => {
  const dateFilter = buildDateFilter(startDate, endDate);
  const result = await reportRepo.aggregateRevenueChart(dateFilter);
  return result.map(r => ({ date: r._id, revenue: r.revenue, orders: r.orders }));
};

// ── Category Performance ──────────────────────────────────────────────────────

export const getCategoryPerformance = async (startDate?: string, endDate?: string) => {
  const dateFilter = buildDateFilter(startDate, endDate);
  const result = await reportRepo.aggregateCategoryPerformance(dateFilter);
  return result.map(r => ({ category: r._id, revenue: r.revenue, sold: r.sold }));
};

// ── Payment Methods ───────────────────────────────────────────────────────────

export const getPaymentMethodsStats = async (startDate?: string, endDate?: string) => {
  const dateFilter = buildDateFilter(startDate, endDate);
  const result = await reportRepo.aggregatePaymentMethods(dateFilter);
  return result.map(r => ({ method: r._id, count: r.count, revenue: r.revenue }));
};

// ── Voucher Stats ─────────────────────────────────────────────────────────────

export const getVoucherStats = async (startDate?: string, endDate?: string) => {
  const dateFilter = buildDateFilter(startDate, endDate);
  const vouchers   = await reportRepo.findAllVouchers(dateFilter);

  return vouchers.map(v => {
    const usageLimit = v.usageLimit || 0;
    const usageRate  = usageLimit > 0
      ? Math.round((v.usedCount / usageLimit) * 100 * 100) / 100
      : (v.usedCount > 0 ? 100 : 0);

    return {
      code:        v.code,
      usedCount:   v.usedCount,
      usageLimit:  v.usageLimit,
      usageRate,
      isActive:    v.isActive,
    };
  });
};
