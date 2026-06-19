import { Router } from "express";
import { authenticate, isOwner } from "../../middlewares/auth.middleware.js";
import { catchAsync } from "../../shared/helpers/catchAsync.js";
import * as response from "../../shared/helpers/response.js";
import * as auditService from "./audit-log.service.js";

const router = Router();

// ── ADMIN & STAFF ONLY ────────────────────────────────────────────────────────

router.get("/", authenticate, isOwner, catchAsync(async (req, res) => {
  const { search, domain, startDate, endDate } = req.query;
  const logs = await auditService.getAuditLogs(
    search as string, 
    domain as string, 
    startDate as string, 
    endDate as string
  );
  return response.success(res, { logs });
}));

export default router;
