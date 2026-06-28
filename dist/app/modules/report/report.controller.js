import { Router } from "express";
import { authenticate, requirePermission, } from "../../middlewares/auth.middleware.js";
import { catchAsync } from "../../shared/helpers/catchAsync.js";
import * as response from "../../shared/helpers/response.js";
import * as reportService from "./report.service.js";
const router = Router();
// ── ADMIN & STAFF ONLY ────────────────────────────────────────────────────────
router.get("/dashboard", authenticate, requirePermission("reports.view"), catchAsync(async (req, res) => {
    const { startDate, endDate } = req.query;
    const result = await reportService.getDashboardStats(startDate, endDate);
    return response.success(res, result);
}));
router.get("/completion-rates", authenticate, requirePermission("reports.view"), catchAsync(async (req, res) => {
    const { startDate, endDate } = req.query;
    const result = await reportService.getCompletionRates(startDate, endDate);
    return response.success(res, result);
}));
router.get("/vouchers", authenticate, requirePermission("reports.view"), catchAsync(async (req, res) => {
    const { startDate, endDate } = req.query;
    const result = await reportService.getVoucherStats(startDate, endDate);
    return response.success(res, result);
}));
router.get("/revenue-chart", authenticate, requirePermission("reports.view"), catchAsync(async (req, res) => {
    const { startDate, endDate } = req.query;
    const result = await reportService.getRevenueChart(startDate, endDate);
    return response.success(res, result);
}));
router.get("/category-performance", authenticate, requirePermission("reports.view"), catchAsync(async (req, res) => {
    const { startDate, endDate } = req.query;
    const result = await reportService.getCategoryPerformance(startDate, endDate);
    return response.success(res, result);
}));
router.get("/payment-methods", authenticate, requirePermission("reports.view"), catchAsync(async (req, res) => {
    const { startDate, endDate } = req.query;
    const result = await reportService.getPaymentMethodsStats(startDate, endDate);
    return response.success(res, result);
}));
router.get("/export-pdf", authenticate, requirePermission("reports.view"), catchAsync(async (req, res) => {
    const { startDate, endDate } = req.query;
    const pdfStream = await reportService.generatePdfReport(startDate, endDate);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Report_${new Date().toISOString().slice(0, 10)}.pdf"`);
    pdfStream.pipe(res);
}));
export default router;
