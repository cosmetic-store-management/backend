import { Router } from "express";
import { authenticate, optionalAuthenticate, requirePermission } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { CreateProductSchema, UpdateProductSchema, UpdateProductStatusSchema } from "./dto/product.request.dto.js";
import { container } from "tsyringe";
import { ProductController } from "./product.controller.js";

const router = Router();
const controller = container.resolve(ProductController);

router.get("/recommendations", optionalAuthenticate, controller.getRecommendations);
router.get("/", controller.getRoot);
router.get("/:slug", controller.getSlug);
router.get("/:id/recommendations", controller.getIdRecommendations);
router.get("/admin/list", authenticate, requirePermission("products.view"), controller.getAdminList);
router.get("/admin/:id", authenticate, requirePermission("products.view"), controller.getAdminId);
router.post("/admin", authenticate, requirePermission("products.manage"), validate(CreateProductSchema), controller.postAdmin);
router.patch("/admin/:id/status", authenticate, requirePermission("products.manage"), validate(UpdateProductStatusSchema), controller.patchAdminIdStatus);
router.patch("/admin/:id", authenticate, requirePermission("products.manage"), validate(UpdateProductSchema), controller.patchAdminId);
router.delete("/admin/:id", authenticate, requirePermission("products.manage"), controller.deleteAdminId);
router.post("/admin/batch-import", authenticate, requirePermission("products.manage"), controller.postAdminBatchImport);

export default router;
