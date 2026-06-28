import { Router } from "express";
import { authenticate, requirePermission, optionalAuth, } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { catchAsync } from "../../shared/helpers/catchAsync.js";
import * as response from "../../shared/helpers/response.js";
import { CreateQASchema, ReplyQASchema } from "./dto/qa.request.dto.js";
import * as qaService from "./qa.service.js";
import { logAction } from "../audit-log/audit-log.service.js";
const router = Router();
// GET /api/qas/admin/list (Admin/Staff only)
router.get("/admin/list", authenticate, requirePermission("reviews.manage"), // dùng chung quyền reviews
catchAsync(async (req, res) => {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const status = req.query.status;
    const productName = req.query.productName;
    const result = await qaService.getAllQAsAdmin(page, limit, status, productName);
    return response.success(res, result);
}));
// DELETE /api/qas/admin/:id (Admin/Staff only)
router.delete("/admin/:id", authenticate, requirePermission("reviews.manage"), catchAsync(async (req, res) => {
    const qaId = req.params.id;
    await qaService.deleteQAAdmin(qaId);
    await logAction(req.user._id.toString(), req.user.name, "delete", "catalog", `Xóa câu hỏi (ID: ${qaId})`, req.ip || "127.0.0.1");
    return response.success(res, { message: "Đã xóa câu hỏi thành công" });
}));
// PATCH /api/qas/admin/:id/reply (Admin/Staff only)
router.patch("/admin/:id/reply", authenticate, requirePermission("reviews.manage"), validate(ReplyQASchema), catchAsync(async (req, res) => {
    const qaId = req.params.id;
    const result = await qaService.replyQAAdmin(qaId, req.user._id.toString(), req.body);
    await logAction(req.user._id.toString(), req.user.name, "update", "catalog", `Trả lời câu hỏi (ID: ${qaId})`, req.ip || "127.0.0.1");
    return response.success(res, {
        message: "Đã trả lời câu hỏi",
        qa: result,
    });
}));
// GET /api/qas/product/:productId (Public)
router.get("/product/:productId", catchAsync(async (req, res) => {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const productId = req.params.productId;
    const result = await qaService.getQAsByProductId(productId, page, limit);
    return response.success(res, result);
}));
// POST /api/qas (Public - Can be logged in or guest)
router.post("/", optionalAuth, validate(CreateQASchema), catchAsync(async (req, res) => {
    const userId = req.user ? req.user._id.toString() : null;
    const qa = await qaService.createQA(userId, req.body);
    return response.created(res, {
        message: "Gửi câu hỏi thành công",
        qa,
    });
}));
export default router;
