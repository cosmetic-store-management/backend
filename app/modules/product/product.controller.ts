import { Router } from "express";
import {
  authenticate,
  optionalAuthenticate,
  requirePermission,
} from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { catchAsync } from "../../shared/helpers/catchAsync.js";
import * as response from "../../shared/helpers/response.js";
import {
  CreateProductSchema,
  UpdateProductSchema,
  UpdateProductStatusSchema,
} from "./dto/product.request.dto.js";
import * as productService from "./product.service.js";
import { logAction } from "../audit-log/audit-log.service.js";
import * as recommendationService from "./recommendation.service.js";

const router = Router();

// ── PUBLIC ────────────────────────────────────────────────────────────────────

// GET /api/products/recommendations (Public, optional auth)
router.get(
  "/recommendations",
  optionalAuthenticate,
  catchAsync(async (req, res) => {
    const limit = parseInt(req.query.limit as string, 10) || 10;
    const userId = req.user ? req.user._id.toString() : null;
    const products = await recommendationService.getRecommendations(userId, limit);
    return response.success(res, { products });
  })
);

// GET /api/products (Public - Chỉ lấy sản phẩm đang Kích hoạt)
router.get(
  "/",
  catchAsync(async (req, res) => {
    const result = await productService.getPublicProducts(req.query as any);
    return response.success(res, result);
  }),
);

// GET /api/products/:slug (Public)
router.get(
  "/:slug",
  catchAsync(async (req, res) => {
    const product = await productService.getPublicProductDetail(
      req.params.slug as string,
    );
    return response.success(res, { product });
  }),
);

// GET /api/products/:id/recommendations (Public)
router.get(
  "/:id/recommendations",
  catchAsync(async (req, res) => {
    const limit = parseInt(req.query.limit as string, 10) || 10;
    const products = await productService.getRecommendedProducts(
      req.params.id as string,
      limit,
    );
    return response.success(res, { products });
  }),
);

// ── ADMIN ─────────────────────────────────────────────────────────────────────

router.get(
  "/admin/list",
  authenticate,
  requirePermission("products.view"),
  catchAsync(async (req, res) => {
    const result = await productService.getAdminProducts({
      ...(req.query as any),
      shopId: req.shopId,
    });
    return response.success(res, result);
  }),
);

router.get(
  "/admin/:id",
  authenticate,
  requirePermission("products.view"),
  catchAsync(async (req, res) => {
    const product = await productService.getAdminProductDetail(
      req.params.id as string,
    );
    return response.success(res, { product });
  }),
);

router.post(
  "/admin",
  authenticate,
  requirePermission("products.manage"),
  validate(CreateProductSchema),
  catchAsync(async (req, res) => {
    const product = await productService.createProduct({
      ...req.body,
      shopId: req.shopId,
    });
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "create",
      "catalog",
      `Tạo sản phẩm "${product.name}"`,
      req.ip || "127.0.0.1",
    );
    return response.created(res, {
      message: "Tạo sản phẩm thành công",
      product,
    });
  }),
);

router.patch(
  "/admin/:id/status",
  authenticate,
  requirePermission("products.manage"),
  validate(UpdateProductStatusSchema),
  catchAsync(async (req, res) => {
    const product = await productService.updateProductStatus(
      req.params.id as string,
      req.body.isActive,
      req.shopId,
    );
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "catalog",
      `Cập nhật trạng thái sản phẩm "${product.name}" thành ${product.isActive ? "Bán" : "Ngừng bán"}`,
      req.ip || "127.0.0.1",
    );
    return response.success(res, {
      message: "Cập nhật trạng thái sản phẩm thành công",
      product,
    });
  }),
);

router.patch(
  "/admin/:id",
  authenticate,
  requirePermission("products.manage"),
  validate(UpdateProductSchema),
  catchAsync(async (req, res) => {
    const product = await productService.updateProduct(
      req.params.id as string,
      { ...req.body, shopId: req.shopId },
    );
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "catalog",
      `Cập nhật thông tin sản phẩm "${product.name}"`,
      req.ip || "127.0.0.1",
    );
    return response.success(res, {
      message: "Cập nhật sản phẩm thành công",
      product,
    });
  }),
);

router.delete(
  "/admin/:id",
  authenticate,
  requirePermission("products.manage"),
  catchAsync(async (req, res) => {
    const product = await productService.getAdminProductDetail(
      req.params.id as string,
      req.shopId,
    );
    await productService.deleteProduct(req.params.id as string, req.shopId);
    if (product) {
      await logAction(
        req.user!._id.toString(),
        req.user!.name,
        "delete",
        "catalog",
        `Xóa sản phẩm "${product.name}"`,
        req.ip || "127.0.0.1",
      );
    }
    return response.success(res, { message: "Xóa sản phẩm thành công" });
  }),
);

router.post(
  "/admin/batch-import",
  authenticate,
  requirePermission("products.manage"),
  catchAsync(async (req, res) => {
    const { products } = req.body;
    if (!products || !Array.isArray(products)) {
      res.status(400).json({ message: "Dữ liệu không hợp lệ" });
      return;
    }
    const result = await productService.batchImportProducts(products);
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "create",
      "catalog",
      `Import hàng loạt ${result.totalProcessed} sản phẩm/biến thể`,
      req.ip || "127.0.0.1",
    );
    return response.success(res, { message: "Import thành công", result });
  })
);

export default router;
