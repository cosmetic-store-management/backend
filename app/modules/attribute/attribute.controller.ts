import { Router } from "express";
import { authenticate, isStaff, isOwner } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { catchAsync } from "../../shared/helpers/catchAsync.js";
import * as response from "../../shared/helpers/response.js";
import { CreateAttributeSchema, UpdateAttributeSchema } from "./dto/attribute.request.dto.js";
import * as attrService from "./attribute.service.js";
import { logAction } from "../audit-log/audit-log.service.js";

const router = Router();

// ── ADMIN & STAFF ONLY ────────────────────────────────────────────────────────

router.get("/", authenticate, isStaff, catchAsync(async (_req, res) => {
  const attributes = await attrService.getAllAttributes();
  return response.success(res, { attributes });
}));

router.get("/:id", authenticate, isStaff, catchAsync(async (req, res) => {
  const attribute = await attrService.getAttributeDetail(req.params.id as string);
  return response.success(res, { attribute });
}));

router.post("/", authenticate, isStaff, validate(CreateAttributeSchema), catchAsync(async (req, res) => {
  const attribute = await attrService.createAttribute(req.body);
  await logAction(req.user!._id.toString(), req.user!.name, "create", "catalog", `Tạo thuộc tính biến thể "${attribute.name}" (Mã: ${attribute.code})`, req.ip || "127.0.0.1");
  return response.created(res, { message: "Tạo thuộc tính thành công", attribute });
}));

router.patch("/:id", authenticate, isStaff, validate(UpdateAttributeSchema), catchAsync(async (req, res) => {
  const attribute = await attrService.updateAttribute(req.params.id as string, req.body);
  await logAction(req.user!._id.toString(), req.user!.name, "update", "catalog", `Cập nhật thuộc tính biến thể "${attribute.name}"`, req.ip || "127.0.0.1");
  return response.success(res, { message: "Cập nhật thuộc tính thành công", attribute });
}));

router.delete("/:id", authenticate, isOwner, catchAsync(async (req, res) => {
  const attribute = await attrService.getAttributeDetail(req.params.id as string);
  await attrService.deleteAttribute(req.params.id as string);
  if (attribute) {
    await logAction(req.user!._id.toString(), req.user!.name, "delete", "catalog", `Xóa thuộc tính biến thể "${attribute.name}"`, req.ip || "127.0.0.1");
  }
  return response.success(res, { message: "Xóa thuộc tính thành công" });
}));

export default router;
