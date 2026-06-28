import { Router } from "express";
import { authenticate, isOwner } from "../../middlewares/auth.middleware.js";
import { catchAsync } from "../../shared/helpers/catchAsync.js";
import * as response from "../../shared/helpers/response.js";
import * as auditService from "./audit-log.service.js";
const router = Router();
// ── ADMIN & STAFF ONLY ────────────────────────────────────────────────────────
router.get("/", authenticate, isOwner, catchAsync(async (req, res) => {
    const { search, domain, startDate, endDate, cursor, limit = "20" } = req.query;
    const result = await auditService.getAuditLogs(search, domain, startDate, endDate, cursor, Number(limit));
    return response.success(res, result);
}));
export default router;
