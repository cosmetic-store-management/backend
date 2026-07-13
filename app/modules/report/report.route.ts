import { Router } from "express";
import { authenticate, requirePermission } from "../../middlewares/auth.middleware.js";
import * as controller from "./report.controller.js";
const router = Router();
router.get("/dashboard", authenticate, requirePermission("reports.view"), controller.getDashboard);
router.get("/completion-rates", authenticate, requirePermission("reports.view"), controller.getCompletionRates);
router.get("/vouchers", authenticate, requirePermission("reports.view"), controller.getVouchers);
router.get("/revenue-chart", authenticate, requirePermission("reports.view"), controller.getRevenueChart);
router.get("/category-performance", authenticate, requirePermission("reports.view"), controller.getCategoryPerformance);
router.get("/payment-methods", authenticate, requirePermission("reports.view"), controller.getPaymentMethods);
router.get("/export-pdf", authenticate, requirePermission("reports.view"), controller.getExportPdf);

export default router;

