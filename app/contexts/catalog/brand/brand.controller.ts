import { injectable, inject } from "tsyringe";
import { catchAsync } from "../../../shared/helpers/catchAsync.js";
import * as response from "../../../shared/helpers/response.js";
import { BrandService } from "./brand.service.js";
import { AuditLogService } from "../../identity/audit-log/audit-log.service.js";

@injectable()
export class BrandController {
  constructor(
    @inject(BrandService) private readonly brandService: BrandService,
    @inject(AuditLogService) private readonly auditService: AuditLogService
  ) {}

  getRoot = catchAsync(async (_req, res) => {
    const result = await this.brandService.getPublicBrands();
    return response.success(res, { brands: result });
  });

  getId = catchAsync(async (req, res) => {
    const brand = await this.brandService.getBrandDetail(req.params.id as string);
    if (!brand.isActive) throw new Error("Brand is inactive");
    return response.success(res, { brand });
  });

  getAdminList = catchAsync(async (req, res) => {
    const result = await this.brandService.getAdminBrands(req.query as any);
    return response.success(res, result);
  });

  getAdminId = catchAsync(async (req, res) => {
    const brand = await this.brandService.getBrandDetail(req.params.id as string);
    return response.success(res, { brand });
  });

  postAdmin = catchAsync(async (req, res) => {
    const brand = await this.brandService.createBrand(req.body);
    await this.auditService.logAction(
      req.user!._id.toString(),
      req.user!.name,
      "create",
      "catalog",
      `Tạo thương hiệu "${brand.name}"`,
      req.ip || "127.0.0.1"
    );
    return response.created(res, {
      message: "Brand created successfully",
      brand,
    });
  });

  patchAdminIdStatus = catchAsync(async (req, res) => {
    const brand = await this.brandService.updateBrandStatus(
      req.params.id as string,
      req.body.isActive
    );
    await this.auditService.logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "catalog",
      `Cập nhật trạng thái thương hiệu "${brand.name}" thành ${brand.isActive ? "Activate" : "Deactivate"}`,
      req.ip || "127.0.0.1"
    );
    return response.success(res, {
      message: "Successfully updated brand status",
      brand,
    });
  });

  patchAdminId = catchAsync(async (req, res) => {
    const brand = await this.brandService.updateBrand(
      req.params.id as string,
      req.body
    );
    await this.auditService.logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "catalog",
      `Cập nhật thông tin thương hiệu "${brand.name}"`,
      req.ip || "127.0.0.1"
    );
    return response.success(res, {
      message: "Successful brand update",
      brand,
    });
  });

  deleteAdminId = catchAsync(async (req, res) => {
    const brand = await this.brandService.getBrandDetail(req.params.id as string);
    await this.brandService.deleteBrand(req.params.id as string);
    await this.auditService.logAction(
      req.user!._id.toString(),
      req.user!.name,
      "delete",
      "catalog",
      `Xóa thương hiệu "${brand.name}"`,
      req.ip || "127.0.0.1"
    );
    return response.success(res, { message: "Brand removal successful" });
  });
}