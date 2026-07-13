import { Router } from "express";
import { authenticate, isAuthenticated, requirePermission } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { UpdateOrderDetailsSchema, UpdateOrderStatusSchema } from "./dto/order.request.dto.js";
import * as controller from "./order.controller.js";
const router = Router();
router.get("/admin/list", authenticate, requirePermission("orders.view"), controller.getAdminList);
router.patch("/admin/:id/status", authenticate, requirePermission("orders.manage"), validate(UpdateOrderStatusSchema), controller.patchAdminIdStatus);
router.patch("/admin/:id/details", authenticate, requirePermission("orders.manage"), validate(UpdateOrderDetailsSchema), controller.patchAdminIdDetails);
router.patch("/admin/:id/refund", authenticate, requirePermission("orders.manage"), controller.patchAdminIdRefund);
router.patch("/admin/:id/return/approve", authenticate, requirePermission("orders.manage"), controller.patchAdminIdReturnApprove);
router.patch("/admin/:id/return/reject", authenticate, requirePermission("orders.manage"), controller.patchAdminIdReturnReject);
router.post("/:id/pos-return", authenticate, requirePermission("orders.manage"), controller.postIdPosReturn);
router.get("/admin/:id/activities", authenticate, requirePermission("orders.view"), controller.getAdminIdActivities);
router.patch("/:id/cancel", authenticate, isAuthenticated, controller.patchIdCancel);
router.patch("/:id/return", authenticate, isAuthenticated, controller.patchIdReturn);
router.get("/track/:code", controller.getTrackCode);
router.get("/my-orders", authenticate, controller.getMyOrders);
router.get("/:id", authenticate, controller.getId);

export default router;

