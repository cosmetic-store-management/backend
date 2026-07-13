import { injectable, inject } from "tsyringe";
import { catchAsync } from "../../../shared/helpers/catchAsync.js";
import * as response from "../../../shared/helpers/response.js";
import { ProductService } from "./product.service.js";
import { AuditLogService } from "../../identity/audit-log/audit-log.service.js";
import { RecommendationService } from "./recommendation.service.js";

@injectable()
export class ProductController {
  constructor(
    @inject(ProductService) private readonly productService: ProductService,
    @inject(AuditLogService) private readonly auditService: AuditLogService,
    @inject(RecommendationService) private readonly recommendationService: RecommendationService
  ) {}

  getRecommendations = catchAsync(async (req, res) => {
    const limit = parseInt(req.query.limit as string, 10) || 10;
    const userId = req.user ? req.user._id.toString() : null;
    const products = await this.recommendationService.getRecommendations(userId, limit);
    return response.success(res, { products });
  });

  getRoot = catchAsync(async (req, res) => {
    const result = await this.productService.getPublicProducts(req.query as any);
    return response.success(res, result);
  });

  getSlug = catchAsync(async (req, res) => {
    const product = await this.productService.getPublicProductDetail(
      req.params.slug as string
    );
    return response.success(res, { product });
  });

  getIdRecommendations = catchAsync(async (req, res) => {
    const limit = parseInt(req.query.limit as string, 10) || 10;
    const products = await this.productService.getRecommendedProducts(
      req.params.id as string,
      limit
    );
    return response.success(res, { products });
  });

  getAdminList = catchAsync(async (req, res) => {
    const result = await this.productService.getAdminProducts({
      ...(req.query as any),
    });
    return response.success(res, result);
  });

  getAdminId = catchAsync(async (req, res) => {
    const product = await this.productService.getAdminProductDetail(
      req.params.id as string
    );
    return response.success(res, { product });
  });

  postAdmin = catchAsync(async (req, res) => {
    const product = await this.productService.createProduct({
      ...req.body,
    });
    await this.auditService.logAction(
      req.user!._id.toString(),
      req.user!.name,
      "create",
      "catalog",
      `Tạo sản phẩm "${product.name}"`,
      req.ip || "127.0.0.1"
    );
    return response.created(res, {
      message: "Product created successfully",
      product,
    });
  });

  patchAdminIdStatus = catchAsync(async (req, res) => {
    const product = await this.productService.updateProductStatus(
      req.params.id as string,
      req.body.isActive
    );
    await this.auditService.logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "catalog",
      `Cập nhật trạng thái sản phẩm "${product.name}" thành ${product.isActive ? "Bán" : "Discontinued"}`,
      req.ip || "127.0.0.1"
    );
    return response.success(res, {
      message: "Product status updated successfully",
      product,
    });
  });

  patchAdminId = catchAsync(async (req, res) => {
    const product = await this.productService.updateProduct(
      req.params.id as string,
      { ...req.body }
    );
    await this.auditService.logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "catalog",
      `Cập nhật thông tin sản phẩm "${product.name}"`,
      req.ip || "127.0.0.1"
    );
    return response.success(res, {
      message: "Product updated successfully",
      product,
    });
  });

  deleteAdminId = catchAsync(async (req, res) => {
    const product = await this.productService.getAdminProductDetail(
      req.params.id as string
    );
    await this.productService.deleteProduct(req.params.id as string);
    if (product) {
      await this.auditService.logAction(
        req.user!._id.toString(),
        req.user!.name,
        "delete",
        "catalog",
        `Xóa sản phẩm "${product.name}"`,
        req.ip || "127.0.0.1"
      );
    }
    return response.success(res, { message: "Product deleted successfully" });
  });

  postAdminBatchImport = catchAsync(async (req, res) => {
    const { products } = req.body;
    if (!products || !Array.isArray(products)) {
      res.status(400).json({ message: "Dữ liệu không hợp lệ" });
      return;
    }
    const result = await this.productService.batchImportProducts(products);
    await this.auditService.logAction(
      req.user!._id.toString(),
      req.user!.name,
      "create",
      "catalog",
      `Import hàng loạt ${result.totalProcessed} sản phẩm/biến thể`,
      req.ip || "127.0.0.1"
    );
    return response.success(res, { message: "Import successful", result });
  });
}