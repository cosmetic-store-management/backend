import { Router } from "express";
import { authenticate, requirePermission } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import * as controller from "./category.controller.js";
import { CreateCategorySchema, UpdateCategorySchema, UpdateCategoryStatusSchema } from "./dto/category.request.dto.js";
const router = Router();
router.get("/", controller.getRoot);
router.get("/:slug", controller.getSlug);
router.get("/admin/list", authenticate, requirePermission("products.view"), controller.getAdminList);
router.get("/admin/:id", authenticate, requirePermission("products.view"), controller.getAdminId);
router.post("/admin", authenticate, requirePermission("products.manage"), validate(CreateCategorySchema), controller.postAdmin);
router.patch("/admin/:id/status", authenticate, requirePermission("products.manage"), validate(UpdateCategoryStatusSchema), controller.patchAdminIdStatus);
router.patch("/admin/:id", authenticate, requirePermission("products.manage"), validate(UpdateCategorySchema), controller.patchAdminId);
router.delete("/admin/:id", authenticate, requirePermission("products.manage"), controller.deleteAdminId);

export default router;

