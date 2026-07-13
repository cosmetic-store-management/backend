import { Router } from "express";
import { authenticate, requirePermission } from "../../../middlewares/auth.middleware.js";
import { validate } from "../../../middlewares/validate.middleware.js";
import { CreateBrandSchema, UpdateBrandSchema, UpdateBrandStatusSchema } from "./dto/brand.request.dto.js";
import { container } from "tsyringe";
import { BrandController } from "./brand.controller.js";

const router = Router();
const controller = container.resolve(BrandController);

router.get("/", controller.getRoot);
router.get("/:id", controller.getId);
router.get("/admin/list", authenticate, requirePermission("products.view"), controller.getAdminList);
router.get("/admin/:id", authenticate, requirePermission("products.view"), controller.getAdminId);
router.post("/admin", authenticate, requirePermission("products.manage"), validate(CreateBrandSchema), controller.postAdmin);
router.patch("/admin/:id/status", authenticate, requirePermission("products.manage"), validate(UpdateBrandStatusSchema), controller.patchAdminIdStatus);
router.patch("/admin/:id", authenticate, requirePermission("products.manage"), validate(UpdateBrandSchema), controller.patchAdminId);
router.delete("/admin/:id", authenticate, requirePermission("products.manage"), controller.deleteAdminId);

export default router;
