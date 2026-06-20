import { Router } from "express";
import { authenticate, isOwner } from "../../middlewares/auth.middleware.js";
import { catchAsync } from "../../shared/helpers/catchAsync.js";
import * as response from "../../shared/helpers/response.js";
import * as settingService from "./setting.service.js";
import { logAction } from "../audit-log/audit-log.service.js";
const router = Router();
// GET /api/settings/public — không cần auth, dùng cho Storefront (Footer, Header)
router.get("/public", catchAsync(async (_req, res) => {
    const all = await settingService.getSettings();
    // Chỉ expose các field an toàn — KHÔNG trả bank details
    const { storeName, phone, email, storeAddress, currency, standardShippingFee, freeShippingThreshold, isCodActive, isBankActive, isQrActive, facebookUrl, instagramUrl, youtubeUrl, logoUrl, description } = all;
    const publicSettings = { storeName, phone, email, storeAddress, currency, standardShippingFee, freeShippingThreshold, isCodActive, isBankActive, isQrActive, facebookUrl, instagramUrl, youtubeUrl, logoUrl, description };
    return response.success(res, publicSettings);
}));
// GET /api/settings — authenticated users (staff/owner/customer)
router.get("/", authenticate, catchAsync(async (_req, res) => {
    const settings = await settingService.getSettings();
    return response.success(res, { settings });
}));
// PUT /api/settings — staff/owner only
router.put("/", authenticate, isOwner, catchAsync(async (req, res) => {
    const settings = await settingService.updateSettings(req.body);
    await logAction(req.user._id.toString(), req.user.name, "update", "settings", "Cập nhật cấu hình cửa hàng", req.ip || "127.0.0.1");
    return response.success(res, { message: "Cấu hình được lưu thành công", settings });
}));
// POST /api/settings/backup — owner only (for data protection)
router.post("/backup", authenticate, isOwner, catchAsync(async (req, res) => {
    const backup = await settingService.exportDatabaseBackup();
    await logAction(req.user._id.toString(), req.user.name, "export", "settings", "Trích xuất bản sao lưu dữ liệu (Backup)", req.ip || "127.0.0.1");
    // We can return the backup directly as a file download or json structure
    res.setHeader("Content-disposition", "attachment; filename=glowup_db_backup.json");
    res.setHeader("Content-type", "application/json");
    return res.send(JSON.stringify(backup, null, 2));
}));
export default router;
