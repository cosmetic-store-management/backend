import { Router } from "express";
import { authenticate, requirePermission, } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { catchAsync } from "../../shared/helpers/catchAsync.js";
import { badRequest } from "../../shared/errors/httpErrors.js";
import * as response from "../../shared/helpers/response.js";
import { CreateReviewSchema } from "./dto/review.request.dto.js";
import * as reviewService from "./review.service.js";
import { logAction } from "../audit-log/audit-log.service.js";
const router = Router();
// GET /api/reviews/admin/list (Admin/Staff only)
router.get("/admin/list", authenticate, requirePermission("reviews.manage"), catchAsync(async (req, res) => {
    const cursor = req.query.cursor;
    const limit = parseInt(req.query.limit, 10) || 10;
    const rating = req.query.rating
        ? parseInt(req.query.rating, 10)
        : undefined;
    const isReplied = req.query.isReplied;
    const productName = req.query.productName;
    const result = await reviewService.getAllReviewsAdmin(cursor || null, limit, rating, isReplied, productName);
    return response.success(res, result);
}));
// DELETE /api/reviews/admin/:id (Admin/Manager only)
router.delete("/admin/:id", authenticate, requirePermission("reviews.manage"), catchAsync(async (req, res) => {
    const reviewId = req.params.id;
    await reviewService.deleteReviewAdmin(reviewId);
    await logAction(req.user._id.toString(), req.user.name, "delete", "catalog", `Xóa đánh giá (ID: ${reviewId})`, req.ip || "127.0.0.1");
    return response.success(res, { message: "Đã xóa đánh giá thành công" });
}));
// PATCH /api/reviews/admin/:id/reply (Admin/Staff only)
router.patch("/admin/:id/reply", authenticate, requirePermission("reviews.manage"), catchAsync(async (req, res) => {
    const reviewId = req.params.id;
    const { replyText } = req.body;
    const result = await reviewService.replyReviewAdmin(reviewId, replyText);
    await logAction(req.user._id.toString(), req.user.name, "update", "catalog", `Phản hồi đánh giá (ID: ${reviewId})`, req.ip || "127.0.0.1");
    return response.success(res, {
        message: "Đã phản hồi đánh giá",
        review: result,
    });
}));
// User routes
router.patch("/:id", authenticate, catchAsync(async (req, res) => {
    const { rating, comment, images } = req.body;
    if (!rating) {
        throw badRequest("Vui lòng cung cấp điểm đánh giá");
    }
    const result = await reviewService.updateReviewByUser(req.user._id.toString(), req.params.id, rating, comment, images);
    return response.success(res, {
        message: "Cập nhật đánh giá thành công",
        review: result,
    });
}));
router.delete("/:id", authenticate, catchAsync(async (req, res) => {
    const { id } = req.params;
    await reviewService.deleteReviewByUser(req.user._id.toString(), id);
    return response.success(res, { message: "Xóa đánh giá thành công" });
}));
// GET /api/reviews/product/:productId
router.get("/product/:productId", catchAsync(async (req, res) => {
    const cursor = req.query.cursor;
    const limit = parseInt(req.query.limit, 10) || 10;
    const rating = req.query.rating
        ? parseInt(req.query.rating, 10)
        : undefined;
    const hasImage = req.query.hasImage === "true";
    const productId = req.params.productId;
    const result = await reviewService.getReviewsByProductId(productId, cursor || null, limit, rating, hasImage);
    // Try to get stats as well
    const stats = await reviewService.getProductReviewStats(productId);
    return response.success(res, { ...result, stats });
}));
// POST /api/reviews
router.post("/", authenticate, validate(CreateReviewSchema), catchAsync(async (req, res) => {
    const review = await reviewService.createReview(req.user._id.toString(), req.body);
    return response.created(res, {
        message: "Đánh giá sản phẩm thành công",
        review,
    });
}));
export default router;
