import { injectable, inject } from "tsyringe";
import { catchAsync } from "../../../shared/helpers/catchAsync.js";
import * as response from "../../../shared/helpers/response.js";
import { CategoryService } from "./category.service.js";
import { AuditLogService } from "../../identity/audit-log/audit-log.service.js";

@injectable()
export class CategoryController {
  constructor(
    @inject(CategoryService) private readonly categoryService: CategoryService,
    @inject(AuditLogService) private readonly auditService: AuditLogService
  ) {}

  getRoot = catchAsync(async (_req, res) => {
    const result = await this.categoryService.getPublicCategories();
    return response.success(res, result as any);
  });

  getSlug = catchAsync(async (req, res) => {
    const category = await this.categoryService.getPublicCategoryDetail(
      req.params.slug as string
    );
    return response.success(res, { category });
  });

  getAdminList = catchAsync(async (req, res) => {
    const result = await this.categoryService.getAdminCategories(req.query as any);
    return response.success(res, result);
  });

  getAdminId = catchAsync(async (req, res) => {
    const category = await this.categoryService.getAdminCategoryDetail(
      req.params.id as string
    );
    return response.success(res, { category });
  });

  postAdmin = catchAsync(async (req, res) => {
    const category = await this.categoryService.createCategory(req.body);
    await this.auditService.logAction(
      req.user!._id.toString(),
      req.user!.name,
      "create",
      "catalog",
      `Tạo danh mục "${category.name}"`,
      req.ip || "127.0.0.1"
    );
    return response.created(res, {
      message: "Tạo danh mục thành công",
      category,
    });
  });

  patchAdminIdStatus = catchAsync(async (req, res) => {
    const category = await this.categoryService.updateCategoryStatus(
      req.params.id as string,
      req.body.isActive
    );
    await this.auditService.logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "catalog",
      `Cập nhật trạng thái danh mục "${category.name}" thành ${category.isActive ? "Hoạt động" : "Ngừng hoạt động"}`,
      req.ip || "127.0.0.1"
    );
    return response.success(res, {
      message: "Cập nhật trạng thái danh mục thành công",
      category,
    });
  });

  patchAdminId = catchAsync(async (req, res) => {
    const category = await this.categoryService.updateCategory(
      req.params.id as string,
      req.body
    );
    await this.auditService.logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "catalog",
      `Cập nhật thông tin danh mục "${category.name}"`,
      req.ip || "127.0.0.1"
    );
    return response.success(res, {
      message: "Cập nhật danh mục thành công",
      category,
    });
  });

  deleteAdminId = catchAsync(async (req, res) => {
    const category = await this.categoryService.getAdminCategoryDetail(
      req.params.id as string
    );
    await this.categoryService.deleteCategory(req.params.id as string);
    if (category) {
      await this.auditService.logAction(
        req.user!._id.toString(),
        req.user!.name,
        "delete",
        "catalog",
        `Xóa danh mục "${category.name}"`,
        req.ip || "127.0.0.1"
      );
    }
    return response.success(res, { message: "Xóa danh mục thành công" });
  });
}