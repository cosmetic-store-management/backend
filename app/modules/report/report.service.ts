import * as reportRepo from "./report.repository.js";
import { getSettings } from "../setting/setting.service.js";
import puppeteer from "puppeteer";
import { PassThrough } from "stream";
import mongoose from "mongoose";

/** Tỷ lệ lợi nhuận mặc định (35%) nếu chưa cấu hình trong Settings */
const DEFAULT_PROFIT_MARGIN = 0.35;

// ── Helper: % thay đổi so với kỳ trước ───────────────────────────────────────

function calcChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100 * 10) / 10;
}

function buildDateFilter(startDate?: string, endDate?: string) {
  const filter: any = {
    note: { $ne: "System auto-cancelled due to payment timeout" }
  };
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }
  return filter;
}

/**
 * Tính "kỳ trước" đối xứng với kỳ hiện tại.
 * Ví dụ: kỳ 7 ngày → trả về start/end của 7 ngày trước.
 * Nếu không có filter → dùng 30 ngày gần nhất so với 30 ngày trước đó.
 */
function getPreviousPeriod(
  startDate?: string,
  endDate?: string,
): { prevStart: Date; prevEnd: Date } {
  const now = new Date();
  const end = endDate ? new Date(endDate) : now;
  const start = startDate
    ? new Date(startDate)
    : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const duration = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1); // 1ms trước start
  const prevStart = new Date(prevEnd.getTime() - duration);

  return { prevStart, prevEnd };
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export const getDashboardStats = async (
  startDate?: string,
  endDate?: string,
  creatorId?: string,
) => {
  const dateFilter = buildDateFilter(startDate, endDate);
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
  const [prevRevenueResult, prevOrdersCount, prevCustomersCount] =
    await Promise.all([
      reportRepo.aggregateRevenueForPeriod(prevStart, prevEnd),
      reportRepo.countOrdersForPeriod(prevStart, prevEnd),
      reportRepo.countCustomersForPeriod(prevStart, prevEnd),
    ]);

  const totalRevenue = revenueResult[0]?.totalRevenue || 0;
  const totalCost = revenueResult[0]?.totalCost || 0;
  const totalSoldProducts = soldProductsResult[0]?.totalSold || 0;
  const prevRevenue = prevRevenueResult[0]?.totalRevenue || 0;

  // ── Recent Orders ──────────────────────────────────────────────────────────
  const recentOrders = recentOrdersRaw.map((o) => {
    const diffMs = Date.now() - new Date((o as any).createdAt).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    let dateStr = "Vừa xong";
    if (diffHours > 0) dateStr = `${diffHours} giờ trước`;
    else if (diffMins > 0) dateStr = `${diffMins} phút trước`;

    const statusMap: Record<string, string> = {
      completed: "Hoàn thành",
      shipping: "Đang giao",
      cancelled: "Đã huỷ",
    };

    return {
      id: o.code,
      customer: o.receiverName,
      items: (o.items || [])
        .map((item: any) => `${item.productName} (x${item.quantity})`)
        .join(", "),
      total: `${o.totalAmount.toLocaleString("vi-VN")}₫`,
      status: statusMap[o.orderStatus] ?? "Chờ xử lý",
      date: dateStr,
    };
  });

  // ── Top Products ───────────────────────────────────────────────────────────
  const topProducts = [];
  for (const agg of topProductsAgg) {
    const prod = await reportRepo.findProductById(agg._id);
    if (prod) {
      const variants = await reportRepo.findVariantsByProductId(prod._id);
      const totalStock = variants.reduce((sum, v) => sum + v.stock, 0);

      topProducts.push({
        name: prod.name,
        category: (prod.categoryId as any)?.name ?? "Mỹ phẩm",
        sold: agg.sold,
        stock: totalStock,
        // % real: sold / total_sold_in_period (không còn hardcode /500)
        percentage:
          totalSoldProducts > 0
            ? Math.min(Math.round((agg.sold / totalSoldProducts) * 100), 100)
            : 0,
      });
    }
  }

  // ── Low Stock ──────────────────────────────────────────────────────────────
  const lowStockItems = await Promise.all(
    lowStockRaw.map(async (v: any) => {
      const prod = await reportRepo.findProductById(v.productId as any);
      return {
        productName: prod?.name || "Sản phẩm không rõ",
        variantName: v.name,
        sku: v.sku,
        stock: v.stock,
        minStock: v.minStock,
      };
    }),
  );

  // Đọc profitMargin từ Settings (cấu hình được qua admin UI)
  const settings = (await getSettings()) as any;
  const profitMarginPct: number =
    typeof settings?.profitMargin === "number"
      ? settings.profitMargin / 100
      : DEFAULT_PROFIT_MARGIN;

  const channelRaw = await reportRepo.aggregateChannelStats(dateFilter);
  const channelStats = {
    online: { revenue: 0, orders: 0, profit: 0 },
    pos: { revenue: 0, orders: 0, profit: 0 }
  };
  channelRaw.forEach((c: any) => {
    const ch = c._id === "pos" ? "pos" : "online";
    channelStats[ch].revenue = c.totalRevenue || 0;
    channelStats[ch].orders = c.count || 0;
    channelStats[ch].profit = (c.totalRevenue || 0) - (c.totalCost || 0);
  });

  return {
    stats: {
      totalRevenue,
      revenueChange: calcChange(totalRevenue, prevRevenue),
      ordersCount: totalOrdersCount,
      ordersChange: calcChange(totalOrdersCount, prevOrdersCount),
      soldProducts: totalSoldProducts,
      newCustomers: totalCustomersCount,
      customersChange: calcChange(totalCustomersCount, prevCustomersCount),
      profit: totalRevenue - totalCost,
      profitMarginPct: totalRevenue > 0 ? Math.round(((totalRevenue - totalCost) / totalRevenue) * 100) : 0, // trả về margin thực tế
      averageOrderValue:
        totalOrdersCount > 0 ? Math.round(totalRevenue / totalOrdersCount) : 0,
    },
    channelStats,
    recentOrders,
    topProducts,
    lowStockItems,
  };
};

// ── Completion Rates ──────────────────────────────────────────────────────────

export const getCompletionRates = async (
  startDate?: string,
  endDate?: string,
) => {
  const dateFilter = buildDateFilter(startDate, endDate);
  const result = await reportRepo.aggregateCompletionRates(dateFilter);

  if (result.length === 0) {
    return {
      total: 0,
      completed: 0,
      cancelled: 0,
      returned: 0,
      processing: 0,
      completedRate: 0,
      cancelledRate: 0,
    };
  }

  const data = result[0];
  return {
    total: data.total,
    completed: data.completed,
    cancelled: data.cancelled,
    returned: data.returned || 0,
    processing: data.processing,
    completedRate: Math.round((data.completed / data.total) * 100 * 100) / 100,
    cancelledRate: Math.round((data.cancelled / data.total) * 100 * 100) / 100,
  };
};

// ── Revenue Chart ─────────────────────────────────────────────────────────────

export const getRevenueChart = async (startDate?: string, endDate?: string) => {
  const dateFilter = buildDateFilter(startDate, endDate);
  const result = await reportRepo.aggregateRevenueChart(dateFilter);
  return result.map((r) => ({
    date: r._id,
    revenue: r.revenue,
    orders: r.orders,
  }));
};

// ── Category Performance ──────────────────────────────────────────────────────

export const getCategoryPerformance = async (
  startDate?: string,
  endDate?: string,
) => {
  const dateFilter = buildDateFilter(startDate, endDate);
  const result = await reportRepo.aggregateCategoryPerformance(dateFilter);
  return result.map((r) => ({
    category: r._id,
    revenue: r.revenue,
    sold: r.sold,
  }));
};

// ── PDF Export ────────────────────────────────────────────────────────────────

export const generatePdfReport = async (
  startDate?: string,
  endDate?: string,
): Promise<PassThrough> => {
  const stats = await getDashboardStats(startDate, endDate);

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #333; line-height: 1.5; margin: 40px; }
        .report-header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
        .report-header h1 { margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 1px; color: #111; }
        .report-header p { margin: 5px 0 0; font-size: 14px; color: #555; }
        
        .section { margin-bottom: 35px; }
        .section-title { font-size: 16px; font-weight: bold; text-transform: uppercase; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-bottom: 15px; }
        
        /* Grid cho các chỉ số tổng quan */
        .metrics-grid { display: flex; flex-wrap: wrap; gap: 15px; }
        .metric-card { flex: 1; min-width: 150px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 15px; text-align: center; }
        .metric-title { font-size: 12px; color: #6b7280; text-transform: uppercase; margin-bottom: 8px; font-weight: 600; }
        .metric-value { font-size: 20px; font-weight: bold; color: #111827; }
        .metric-change { font-size: 12px; margin-top: 5px; }
        .positive { color: #10b981; }
        .negative { color: #ef4444; }
        
        table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 10px; }
        th, td { border: 1px solid #e5e7eb; padding: 10px 12px; text-align: left; }
        th { background-color: #f3f4f6; color: #374151; font-weight: 600; text-transform: uppercase; font-size: 11px; }
        tbody tr:nth-child(even) { background-color: #f9fafb; }
        
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .danger-text { color: #dc2626; font-weight: bold; }
        
        .footer { margin-top: 50px; border-top: 1px solid #ddd; padding-top: 20px; text-align: center; font-size: 11px; color: #6b7280; }
      </style>
    </head>
    <body>
      <div class="report-header">
        <h1>BÁO CÁO DOANH THU & BÁN HÀNG</h1>
        <p><strong>Cửa hàng:</strong> Cosmetic Shop</p>
        <p><strong>Kỳ báo cáo:</strong> ${startDate ? new Date(startDate).toLocaleDateString("vi-VN") : "Từ đầu"} - ${endDate ? new Date(endDate).toLocaleDateString("vi-VN") : "Hiện tại"}</p>
        <p><strong>Thời gian kết xuất:</strong> ${new Date().toLocaleString("vi-VN")}</p>
      </div>

      <!-- TỔNG QUAN TÀI CHÍNH VÀ HIỆU SUẤT -->
      <div class="section">
        <div class="section-title">1. Tổng Quan Hiệu Suất Bán Hàng</div>
        <div class="metrics-grid">
          <div class="metric-card">
            <div class="metric-title">Tổng Doanh Thu (Gross)</div>
            <div class="metric-value">${stats.stats.totalRevenue.toLocaleString("vi-VN")} ₫</div>
            <div class="metric-change ${stats.stats.revenueChange >= 0 ? "positive" : "negative"}">
              ${stats.stats.revenueChange >= 0 ? "▲" : "▼"} ${Math.abs(stats.stats.revenueChange)}% so với kỳ trước
            </div>
          </div>
          <div class="metric-card">
            <div class="metric-title">Số Lượng Đơn Hàng</div>
            <div class="metric-value">${stats.stats.ordersCount}</div>
            <div class="metric-change ${stats.stats.ordersChange >= 0 ? "positive" : "negative"}">
              ${stats.stats.ordersChange >= 0 ? "▲" : "▼"} ${Math.abs(stats.stats.ordersChange)}% so với kỳ trước
            </div>
          </div>
          <div class="metric-card">
            <div class="metric-title">Giá Trị Đơn Trung Bình (AOV)</div>
            <div class="metric-value">${stats.stats.averageOrderValue.toLocaleString("vi-VN")} ₫</div>
            <div class="metric-change" style="color: #6b7280;">Doanh thu / Đơn hàng</div>
          </div>
          <div class="metric-card">
            <div class="metric-title">Sản Phẩm Bán Ra</div>
            <div class="metric-value">${stats.stats.soldProducts}</div>
            <div class="metric-change" style="color: #6b7280;">Tổng Items</div>
          </div>
          <div class="metric-card">
            <div class="metric-title">Khách Hàng Mới</div>
            <div class="metric-value">${stats.stats.newCustomers}</div>
            <div class="metric-change ${stats.stats.customersChange >= 0 ? "positive" : "negative"}">
              ${stats.stats.customersChange >= 0 ? "▲" : "▼"} ${Math.abs(stats.stats.customersChange)}% so với kỳ trước
            </div>
          </div>
        </div>
      </div>

      <!-- SẢN PHẨM BÁN CHẠY -->
      <div class="section">
        <div class="section-title">2. Top 5 Sản Phẩm Bán Chạy Nhất</div>
        <table>
          <thead>
            <tr>
              <th width="5%">STT</th>
              <th width="45%">Tên Sản Phẩm</th>
              <th width="20%">Danh Mục</th>
              <th width="15%" class="text-right">SL Bán Ra</th>
              <th width="15%" class="text-right">Tồn Kho Hiện Tại</th>
            </tr>
          </thead>
          <tbody>
            ${
              stats.topProducts && stats.topProducts.length > 0
                ? stats.topProducts
                    .map(
                      (item: any, index: number) => `
                <tr>
                  <td class="text-center">${index + 1}</td>
                  <td>${item.name}</td>
                  <td>${item.category}</td>
                  <td class="text-right"><strong>${item.sold}</strong></td>
                  <td class="text-right">${item.stock}</td>
                </tr>
              `,
                    )
                    .join("")
                : '<tr><td colspan="5" class="text-center">Chưa có dữ liệu sản phẩm bán ra trong kỳ.</td></tr>'
            }
          </tbody>
        </table>
      </div>

      <!-- CẢNH BÁO TỒN KHO -->
      <div class="section" style="page-break-inside: avoid;">
        <div class="section-title">3. Cảnh Báo Sản Phẩm Sắp Hết Hàng (Low Stock)</div>
        <table>
          <thead>
            <tr>
              <th width="5%">STT</th>
              <th width="35%">Mã (SKU)</th>
              <th width="35%">Sản Phẩm - Biến Thể</th>
              <th width="15%" class="text-right">Tồn Thực Tế</th>
              <th width="10%" class="text-right">Mức Tối Thiểu</th>
            </tr>
          </thead>
          <tbody>
            ${
              stats.lowStockItems && stats.lowStockItems.length > 0
                ? stats.lowStockItems
                    .map(
                      (item: any, index: number) => `
                <tr>
                  <td class="text-center">${index + 1}</td>
                  <td>${item.sku}</td>
                  <td>${item.productName} ${item.variantName ? '- ' + item.variantName : ''}</td>
                  <td class="text-right danger-text">${item.stock}</td>
                  <td class="text-right">${item.minStock}</td>
                </tr>
              `,
                    )
                    .join("")
                : '<tr><td colspan="5" class="text-center">Số lượng tồn kho của các sản phẩm đang ở mức an toàn.</td></tr>'
            }
          </tbody>
        </table>
      </div>

      <div class="footer">
        <p>Báo cáo Doanh thu - Cửa hàng Cosmetic Shop</p>
        <p>Được tạo tự động theo chuẩn báo cáo nội bộ Hệ thống Quản trị (Dựa trên khung mẫu từ KiotViet/Sapo).</p>
      </div>
    </body>
    </html>
  `;

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: "networkidle0" as any });
  
  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "20px", bottom: "20px", left: "20px", right: "20px" }
  });
  
  await browser.close();

  const stream = new PassThrough();
  stream.end(pdfBuffer);
  return stream;
};


// ── Payment Methods ───────────────────────────────────────────────────────────

export const getPaymentMethodsStats = async (
  startDate?: string,
  endDate?: string,
) => {
  const dateFilter = buildDateFilter(startDate, endDate);
  const result = await reportRepo.aggregatePaymentMethods(dateFilter);
  return result.map((r) => ({
    method: r._id,
    count: r.count,
    revenue: r.revenue,
  }));
};

// ── Voucher Stats ─────────────────────────────────────────────────────────────

export const getVoucherStats = async (startDate?: string, endDate?: string) => {
  const dateFilter = buildDateFilter(startDate, endDate);
  const vouchers = await reportRepo.findAllVouchers(dateFilter);

  return vouchers.map((v: any) => {
    const usageLimit = v.usageLimit || 0;
    const usageRate =
      usageLimit > 0
        ? Math.round((v.usedCount / usageLimit) * 100 * 100) / 100
        : v.usedCount > 0
          ? 100
          : 0;

    return {
      code: v.code,
      usedCount: v.usedCount,
      usageLimit: v.usageLimit,
      usageRate,
      isActive: v.isActive,
    };
  });
};
