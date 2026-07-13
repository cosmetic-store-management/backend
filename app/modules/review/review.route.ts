import { Router } from "express";
import { authenticate, optionalAuth, requirePermission } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { CreateReviewSchema } from "./dto/review.request.dto.js";
import * as controller from "./review.controller.js";
const router = Router();
router.get("/admin/list", authenticate, requirePermission("reviews.manage"), controller.getAdminList);
router.delete("/admin/:id", authenticate, requirePermission("reviews.manage"), controller.deleteAdminId);
router.patch("/admin/:id/reply", authenticate, requirePermission("reviews.manage"), controller.patchAdminIdReply);
router.patch("/:id", authenticate, controller.patchId);
router.delete("/:id", authenticate, controller.deleteId);
router.get("/product/:productId", optionalAuth, controller.getProductProductId);
router.post("/", authenticate, validate(CreateReviewSchema), controller.postRoot);
router.get("/eligibility/:productId", authenticate, controller.getEligibilityProductId);
router.post("/:id/like", authenticate, controller.postIdLike);
router.post("/:id/dislike", authenticate, controller.postIdDislike);

export default router;

