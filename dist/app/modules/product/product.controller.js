import { Router } from "express";
import { authenticate, optionalAuthenticate, requirePermission, } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { catchAsync } from "../../shared/helpers/catchAsync.js";
import * as response from "../../shared/helpers/response.js";
import { CreateProductSchema, UpdateProductSchema, UpdateProductStatusSchema, } from "./dto/product.request.dto.js";
import * as productService from "./product.service.js";
import { logAction } from "../audit-log/audit-log.service.js";
import * as recommendationService from "./recommendation.service.js";
const router = Router();
// ── PUBLIC ────────────────────────────────────────────────────────────────────
// GET /api/products/recommendations (Public, optional auth)
router.get("/recommendations", optionalAuthenticate, catchAsync(async (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 10;
    const userId = req.user ? req.user._id.toString() : null;
    const products = await recommendationService.getRecommendations(userId, limit);
    return response.success(res, { products });
}));
// GET /api/products (Public - Chỉ lấy sản phẩm đang Kích hoạt)
router.get("/", catchAsync(async (req, res) => {
    const result = await productService.getPublicProducts(req.query);
    return response.success(res, result);
}));
// GET /api/products/:slug (Public)
router.get("/:slug", catchAsync(async (req, res) => {
    const product = await productService.getPublicProductDetail(req.params.slug);
    return response.success(res, { product });
}));
// GET /api/products/:id/recommendations (Public)
router.get("/:id/recommendations", catchAsync(async (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 10;
    const products = await productService.getRecommendedProducts(req.params.id, limit);
    return response.success(res, { products });
}));
// ── ADMIN ─────────────────────────────────────────────────────────────────────
router.get("/admin/list", authenticate, requirePermission("products.view"), catchAsync(async (req, res) => {
    const result = await productService.getAdminProducts({
        ...req.query,
    });
    return response.success(res, result);
}));
router.get("/admin/:id", authenticate, requirePermission("products.view"), catchAsync(async (req, res) => {
    const product = await productService.getAdminProductDetail(req.params.id);
    return response.success(res, { product });
}));
router.post("/admin", authenticate, requirePermission("products.manage"), validate(CreateProductSchema), catchAsync(async (req, res) => {
    const product = await productService.createProduct({
        ...req.body,
    });
    await logAction(req.user._id.toString(), req.user.name, "create", "catalog", `Tạo sản phẩm "${product.name}"`, req.ip || "127.0.0.1");
    return response.created(res, {
        message: "Product created successfully",
        product,
    });
}));
router.patch("/admin/:id/status", authenticate, requirePermission("products.manage"), validate(UpdateProductStatusSchema), catchAsync(async (req, res) => {
    const product = await productService.updateProductStatus(req.params.id, req.body.isActive);
    await logAction(req.user._id.toString(), req.user.name, "update", "catalog", `Cập nhật trạng thái sản phẩm "${product.name}" thành ${product.isActive ? "Bán" : "Discontinued"}`, req.ip || "127.0.0.1");
    return response.success(res, {
        message: "Product status updated successfully",
        product,
    });
}));
router.patch("/admin/:id", authenticate, requirePermission("products.manage"), validate(UpdateProductSchema), catchAsync(async (req, res) => {
    const product = await productService.updateProduct(req.params.id, { ...req.body });
    await logAction(req.user._id.toString(), req.user.name, "update", "catalog", `Cập nhật thông tin sản phẩm "${product.name}"`, req.ip || "127.0.0.1");
    return response.success(res, {
        message: "Product updated successfully",
        product,
    });
}));
router.delete("/admin/:id", authenticate, requirePermission("products.manage"), catchAsync(async (req, res) => {
    const product = await productService.getAdminProductDetail(req.params.id);
    await productService.deleteProduct(req.params.id);
    if (product) {
        await logAction(req.user._id.toString(), req.user.name, "delete", "catalog", `Xóa sản phẩm "${product.name}"`, req.ip || "127.0.0.1");
    }
    return response.success(res, { message: "Product deleted successfully" });
}));
router.post("/admin/batch-import", authenticate, requirePermission("products.manage"), catchAsync(async (req, res) => {
    const { products } = req.body;
    if (!products || !Array.isArray(products)) {
        res.status(400).json({ message: "Dữ liệu không hợp lệ" });
        return;
    }
    const result = await productService.batchImportProducts(products);
    await logAction(req.user._id.toString(), req.user.name, "create", "catalog", `Import hàng loạt ${result.totalProcessed} sản phẩm/biến thể`, req.ip || "127.0.0.1");
    return response.success(res, { message: "Import successful", result });
}));
export default router;
