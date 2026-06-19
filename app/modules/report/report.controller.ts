import { Router } from "express";
import { authenticate, isStaff } from "../../middlewares/auth.middleware.js";
import { catchAsync } from "../../shared/helpers/catchAsync.js";
import * as response from "../../shared/helpers/response.js";
import * as reportService from "./report.service.js";

const router = Router();

// ── ADMIN & STAFF ONLY ────────────────────────────────────────────────────────

router.get("/dashboard", authenticate, isStaff, catchAsync(async (req, res) => {
  const { startDate, endDate } = req.query as { startDate?: string, endDate?: string };
  const result = await reportService.getDashboardStats(startDate, endDate);
  return response.success(res, result);
}));

router.get("/completion-rates", authenticate, isStaff, catchAsync(async (req, res) => {
  const { startDate, endDate } = req.query as { startDate?: string, endDate?: string };
  const result = await reportService.getCompletionRates(startDate, endDate);
  return response.success(res, result);
}));

router.get("/vouchers", authenticate, isStaff, catchAsync(async (req, res) => {
  const { startDate, endDate } = req.query as { startDate?: string, endDate?: string };
  const result = await reportService.getVoucherStats(startDate, endDate);
  return response.success(res, result as any);
}));

router.get("/revenue-chart", authenticate, isStaff, catchAsync(async (req, res) => {
  const { startDate, endDate } = req.query as { startDate?: string, endDate?: string };
  const result = await reportService.getRevenueChart(startDate, endDate);
  return response.success(res, result as any);
}));

router.get("/category-performance", authenticate, isStaff, catchAsync(async (req, res) => {
  const { startDate, endDate } = req.query as { startDate?: string, endDate?: string };
  const result = await reportService.getCategoryPerformance(startDate, endDate);
  return response.success(res, result as any);
}));

router.get("/payment-methods", authenticate, isStaff, catchAsync(async (req, res) => {
  const { startDate, endDate } = req.query as { startDate?: string, endDate?: string };
  const result = await reportService.getPaymentMethodsStats(startDate, endDate);
  return response.success(res, result as any);
}));

export default router;
