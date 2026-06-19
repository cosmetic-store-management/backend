import { Router } from "express";
import { authenticate, isStaff, isManager, isOwner } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { catchAsync } from "../../shared/helpers/catchAsync.js";
import * as response from "../../shared/helpers/response.js";
import {
  CreateBrandSchema,
  UpdateBrandSchema,
  UpdateBrandStatusSchema,
} from "./dto/brand.request.dto.js";
import * as brandService from "./brand.service.js";
import { logAction } from "../audit-log/audit-log.service.js";

const router = Router();

// ── PUBLIC ────────────────────────────────────────────────────────────────────

// GET /api/brands (Public - Chỉ lấy Thương hiệu đang Hợp tác)
router.get("/", catchAsync(async (_req, res) => {
  const result = await brandService.getPublicBrands();
  return response.success(res, { brands: result });
}));

// GET /api/brands/:id (Public - Không dùng slug vì Brand DB không có slug public)
router.get("/:id", catchAsync(async (req, res) => {
  const brand = await brandService.getBrandDetail(req.params.id as string);
  if (!brand.isActive) throw new Error("Thương hiệu ngừng hoạt động");
  return response.success(res, { brand });
}));

// ── ADMIN ─────────────────────────────────────────────────────────────────────

router.get("/admin/list", authenticate, isStaff, catchAsync(async (req, res) => {
  const result = await brandService.getAdminBrands(req.query as any);
  return response.success(res, result);
}));

router.get("/admin/:id", authenticate, isStaff, catchAsync(async (req, res) => {
  const brand = await brandService.getBrandDetail(req.params.id as string);
  return response.success(res, { brand });
}));

router.post("/admin", authenticate, isManager, validate(CreateBrandSchema), catchAsync(async (req, res) => {
  const brand = await brandService.createBrand(req.body);
  await logAction(req.user!._id.toString(), req.user!.name, "create", "catalog", `Tạo thương hiệu "${brand.name}"`, req.ip || "127.0.0.1");
  return response.created(res, { message: "Tạo thương hiệu thành công", brand });
}));

router.patch("/admin/:id/status", authenticate, isManager, validate(UpdateBrandStatusSchema), catchAsync(async (req, res) => {
  const brand = await brandService.updateBrandStatus(req.params.id as string, req.body.isActive);
  await logAction(req.user!._id.toString(), req.user!.name, "update", "catalog", `Cập nhật trạng thái thương hiệu "${brand.name}" thành ${brand.isActive ? "Kích hoạt" : "Ngừng kích hoạt"}`, req.ip || "127.0.0.1");
  return response.success(res, { message: "Cập nhật trạng thái thương hiệu thành công", brand });
}));

router.patch("/admin/:id", authenticate, isManager, validate(UpdateBrandSchema), catchAsync(async (req, res) => {
  const brand = await brandService.updateBrand(req.params.id as string, req.body);
  await logAction(req.user!._id.toString(), req.user!.name, "update", "catalog", `Cập nhật thông tin thương hiệu "${brand.name}"`, req.ip || "127.0.0.1");
  return response.success(res, { message: "Cập nhật thương hiệu thành công", brand });
}));

router.delete("/admin/:id", authenticate, isManager, catchAsync(async (req, res) => {
  const brand = await brandService.getBrandDetail(req.params.id as string);
  await brandService.deleteBrand(req.params.id as string);
  await logAction(req.user!._id.toString(), req.user!.name, "delete", "catalog", `Xóa thương hiệu "${brand.name}"`, req.ip || "127.0.0.1");
  return response.success(res, { message: "Xóa thương hiệu thành công" });
}));

export default router;
