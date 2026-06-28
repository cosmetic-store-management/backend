/**
 * report.service.test.ts — Unit tests cho Report Service
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("../../app/modules/report/report.repository.js");
vi.mock("../../app/modules/setting/setting.service.js");

import * as reportRepo from "../../app/modules/report/report.repository.js";
import * as settingService from "../../app/modules/setting/setting.service.js";
import * as reportService from "../../app/modules/report/report.service.js";

beforeEach(() => {
  vi.clearAllMocks();
  // Mock settings by default (35% profit margin)
  vi.mocked(settingService.getSettings).mockResolvedValue({ profitMargin: 35 } as any);
});

describe("reportService.getDashboardStats", () => {
  it("trả về thống kê chính xác với % thay đổi (calcChange)", async () => {
    // Mock current period
    vi.mocked(reportRepo.aggregateRevenue).mockResolvedValue([{ totalRevenue: 1000000, totalCost: 650000 }] as any);
    vi.mocked(reportRepo.countOrders).mockResolvedValue(10);
    vi.mocked(reportRepo.aggregateSoldProducts).mockResolvedValue([{ totalSold: 50 }] as any);
    vi.mocked(reportRepo.countCustomers).mockResolvedValue(5);
    
    // Mock recent orders
    vi.mocked(reportRepo.findRecentOrders).mockResolvedValue([{
      code: "ORD001",
      receiverName: "Nguyen A",
      items: [{ productName: "Son", quantity: 2 }],
      totalAmount: 200000,
      orderStatus: "completed",
      createdAt: new Date(Date.now() - 3600 * 1000) // 1 giờ trước
    }] as any);

    // Mock top products
    vi.mocked(reportRepo.aggregateTopProducts).mockResolvedValue([{ _id: "prod1", sold: 25 }] as any);
    vi.mocked(reportRepo.findProductById).mockResolvedValue({ _id: "prod1", name: "Son kem", categoryId: { name: "Son môi" } } as any);
    vi.mocked(reportRepo.findVariantsByProductId).mockResolvedValue([{ stock: 100 }] as any);

    // Mock low stock
    vi.mocked(reportRepo.findLowStockVariants).mockResolvedValue([{
      productId: "prod2", name: "Đỏ đậm", sku: "SON-DO", stock: 2, minStock: 5
    }] as any);

    // Mock previous period
    // Rev: 500k -> 1M (+100%)
    // Orders: 5 -> 10 (+100%)
    // Customers: 5 -> 5 (0%)
    vi.mocked(reportRepo.aggregateRevenueForPeriod).mockResolvedValue([{ totalRevenue: 500000 }] as any);
    vi.mocked(reportRepo.countOrdersForPeriod).mockResolvedValue(5);
    vi.mocked(reportRepo.countCustomersForPeriod).mockResolvedValue(5);

    const result = await reportService.getDashboardStats();

    expect(result.stats.totalRevenue).toBe(1000000);
    expect(result.stats.revenueChange).toBe(100); // (1M - 500k)/500k * 100 = 100%
    expect(result.stats.ordersCount).toBe(10);
    expect(result.stats.ordersChange).toBe(100); // (10 - 5)/5 * 100 = 100%
    expect(result.stats.newCustomers).toBe(5);
    expect(result.stats.customersChange).toBe(0); // 0%
    
    // profit = 1,000,000 * 0.35 = 350,000
    expect(result.stats.profit).toBe(350000);
    expect(result.stats.profitMarginPct).toBe(35);
    expect(result.stats.averageOrderValue).toBe(100000); // 1M / 10

    // Recent orders
    expect(result.recentOrders[0].id).toBe("ORD001");
    expect(result.recentOrders[0].date).toBe("1 giờ trước");
    expect(result.recentOrders[0].status).toBe("Hoàn thành");

    // Top products
    expect(result.topProducts[0].name).toBe("Son kem");
    expect(result.topProducts[0].sold).toBe(25);
    expect(result.topProducts[0].percentage).toBe(50); // 25 / 50 totalSold = 50%

    // Low stock
    expect(result.lowStockItems[0].variantName).toBe("Đỏ đậm");
    expect(result.lowStockItems[0].stock).toBe(2);
  });

  it("trả về 0 khi không có dữ liệu", async () => {
    vi.mocked(reportRepo.aggregateRevenue).mockResolvedValue([]);
    vi.mocked(reportRepo.countOrders).mockResolvedValue(0);
    vi.mocked(reportRepo.aggregateSoldProducts).mockResolvedValue([]);
    vi.mocked(reportRepo.countCustomers).mockResolvedValue(0);
    vi.mocked(reportRepo.findRecentOrders).mockResolvedValue([]);
    vi.mocked(reportRepo.aggregateTopProducts).mockResolvedValue([]);
    vi.mocked(reportRepo.findLowStockVariants).mockResolvedValue([]);
    vi.mocked(reportRepo.aggregateRevenueForPeriod).mockResolvedValue([]);
    vi.mocked(reportRepo.countOrdersForPeriod).mockResolvedValue(0);
    vi.mocked(reportRepo.countCustomersForPeriod).mockResolvedValue(0);

    const result = await reportService.getDashboardStats();

    expect(result.stats.totalRevenue).toBe(0);
    expect(result.stats.revenueChange).toBe(0); // prev = 0 -> current = 0 -> 0%
    expect(result.stats.profit).toBe(0);
    expect(result.stats.averageOrderValue).toBe(0);
  });

  it("trả về revenueChange là 100% nếu kỳ trước là 0 và kỳ này lớn hơn 0", async () => {
    vi.mocked(reportRepo.aggregateRevenue).mockResolvedValue([{ totalRevenue: 1000 }] as any);
    vi.mocked(reportRepo.countOrders).mockResolvedValue(0);
    vi.mocked(reportRepo.aggregateSoldProducts).mockResolvedValue([]);
    vi.mocked(reportRepo.countCustomers).mockResolvedValue(0);
    vi.mocked(reportRepo.findRecentOrders).mockResolvedValue([]);
    vi.mocked(reportRepo.aggregateTopProducts).mockResolvedValue([]);
    vi.mocked(reportRepo.findLowStockVariants).mockResolvedValue([]);
    
    vi.mocked(reportRepo.aggregateRevenueForPeriod).mockResolvedValue([]);
    vi.mocked(reportRepo.countOrdersForPeriod).mockResolvedValue(0);
    vi.mocked(reportRepo.countCustomersForPeriod).mockResolvedValue(0);

    const result = await reportService.getDashboardStats();
    expect(result.stats.revenueChange).toBe(100);
  });
});

describe("reportService.getCompletionRates", () => {
  it("tính toán đúng tỷ lệ hoàn thành", async () => {
    vi.mocked(reportRepo.aggregateCompletionRates).mockResolvedValue([{
      total: 10,
      completed: 7,
      cancelled: 2,
      processing: 1,
    }] as any);

    const result = await reportService.getCompletionRates();
    expect(result.total).toBe(10);
    expect(result.completedRate).toBe(70); // 7/10 * 100 = 70%
    expect(result.cancelledRate).toBe(20); // 2/10 * 100 = 20%
  });

  it("trả về 0 khi không có đơn hàng", async () => {
    vi.mocked(reportRepo.aggregateCompletionRates).mockResolvedValue([]);

    const result = await reportService.getCompletionRates();
    expect(result.total).toBe(0);
    expect(result.completedRate).toBe(0);
  });
});

describe("reportService.getRevenueChart", () => {
  it("map dữ liệu biểu đồ chính xác", async () => {
    vi.mocked(reportRepo.aggregateRevenueChart).mockResolvedValue([
      { _id: "2026-06-21", revenue: 50000, orders: 2 },
      { _id: "2026-06-22", revenue: 150000, orders: 5 }
    ] as any);

    const result = await reportService.getRevenueChart();
    expect(result.length).toBe(2);
    expect(result[0].date).toBe("2026-06-21");
    expect(result[0].revenue).toBe(50000);
  });
});

describe("reportService.getCategoryPerformance", () => {
  it("map dữ liệu category chính xác", async () => {
    vi.mocked(reportRepo.aggregateCategoryPerformance).mockResolvedValue([
      { _id: "Son môi", revenue: 200000, sold: 10 }
    ] as any);

    const result = await reportService.getCategoryPerformance();
    expect(result[0].category).toBe("Son môi");
  });
});

describe("reportService.getPaymentMethodsStats", () => {
  it("map dữ liệu payment method chính xác", async () => {
    vi.mocked(reportRepo.aggregatePaymentMethods).mockResolvedValue([
      { _id: "cod", count: 10, revenue: 100000 },
      { _id: "banking", count: 5, revenue: 50000 }
    ] as any);

    const result = await reportService.getPaymentMethodsStats();
    expect(result.length).toBe(2);
    expect(result[0].method).toBe("cod");
  });
});

describe("reportService.getVoucherStats", () => {
  it("tính toán đúng tỷ lệ sử dụng voucher", async () => {
    vi.mocked(reportRepo.findAllVouchers).mockResolvedValue([
      { code: "GIAM10", usedCount: 50, usageLimit: 100, isActive: true },
      { code: "UNLIMITED", usedCount: 200, usageLimit: 0, isActive: true },
      { code: "UNUSED", usedCount: 0, usageLimit: 50, isActive: false },
    ] as any);

    const result = await reportService.getVoucherStats();
    expect(result.length).toBe(3);
    
    // GIAM10 (50/100) -> 50%
    expect(result[0].usageRate).toBe(50);
    
    // UNLIMITED (limit = 0, usedCount = 200) -> 100%
    expect(result[1].usageRate).toBe(100);
    
    // UNUSED (0/50) -> 0%
    expect(result[2].usageRate).toBe(0);
  });
});
