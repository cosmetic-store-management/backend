import { Router } from "express";
import { authenticate, requirePermission, isAuthenticated, } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { catchAsync } from "../../shared/helpers/catchAsync.js";
import * as response from "../../shared/helpers/response.js";
import { UpdateOrderStatusSchema, UpdateOrderDetailsSchema, } from "./dto/order.request.dto.js";
import * as orderService from "./order.service.js";
import { logAction } from "../audit-log/audit-log.service.js";
const router = Router();
router.get("/admin/list", authenticate, requirePermission("orders.view"), catchAsync(async (req, res) => {
    const result = await orderService.getOrdersForAdmin(req.query);
    return response.success(res, result);
}));
router.patch("/admin/:id/status", authenticate, requirePermission("orders.manage"), validate(UpdateOrderStatusSchema), catchAsync(async (req, res) => {
    const order = await orderService.updateOrderStatus(req.params.id, req.body, req.user);
    await logAction(req.user._id.toString(), req.user.name, "update", "sales", `Updated order status "${order.code}" to "${order.orderStatus}"`, req.ip || "127.0.0.1");
    return response.success(res, {
        message: "Order updated successfully",
        order,
    });
}));
router.patch("/admin/:id/details", authenticate, requirePermission("orders.manage"), validate(UpdateOrderDetailsSchema), catchAsync(async (req, res) => {
    const order = await orderService.updateOrderDetailsAdmin(req.params.id, req.body);
    await logAction(req.user._id.toString(), req.user.name, "update", "sales", `Updated delivery details for order "${order.code}"`, req.ip || "127.0.0.1");
    return response.success(res, {
        message: "Order details updated successfully",
        order,
    });
}));
router.patch("/admin/:id/refund", authenticate, requirePermission("orders.manage"), catchAsync(async (req, res) => {
    const order = await orderService.refundOrderAdmin(req.params.id);
    await logAction(req.user._id.toString(), req.user.name, "update", "sales", `Confirmed manual refund transfer for order "${order.code}"`, req.ip || "127.0.0.1");
    return response.success(res, {
        message: "Refund confirmed successfully",
        order,
    });
}));
router.patch("/admin/:id/return/approve", authenticate, requirePermission("orders.manage"), catchAsync(async (req, res) => {
    const order = await orderService.approveReturnOrder(req.params.id, req.user);
    await logAction(req.user._id.toString(), req.user.name, "update", "sales", `Approved return request for order "${order.code}"`, req.ip || "127.0.0.1");
    return response.success(res, { message: "Return request approved successfully", order });
}));
router.patch("/admin/:id/return/reject", authenticate, requirePermission("orders.manage"), catchAsync(async (req, res) => {
    const order = await orderService.rejectReturnOrder(req.params.id, req.user, req.body.rejectReason);
    await logAction(req.user._id.toString(), req.user.name, "update", "sales", `Rejected return request for order "${order.code}". Reason: ${req.body.rejectReason}`, req.ip || "127.0.0.1");
    return response.success(res, { message: "Return request rejected successfully", order });
}));
router.post("/:id/pos-return", authenticate, requirePermission("orders.manage"), catchAsync(async (req, res) => {
    const { returnItems } = req.body;
    const order = await orderService.processPOSReturn(req.params.id, req.user, returnItems);
    await logAction(req.user._id.toString(), req.user.name, "update", "sales", `Processed POS return for order "${order.code}"`, req.ip || "127.0.0.1");
    return response.success(res, { message: "POS Return processed successfully", order });
}));
// ── PUBLIC / CUSTOMER ─────────────────────────────────────────────────────────
// Customer cancels their own order (pending only)
router.patch("/:id/cancel", authenticate, isAuthenticated, catchAsync(async (req, res) => {
    const order = await orderService.cancelOrder(req.params.id, req.user);
    return response.success(res, { message: "Order cancelled successfully", order });
}));
// Customer requests a return (when completed)
router.patch("/:id/return", authenticate, isAuthenticated, catchAsync(async (req, res) => {
    const order = await orderService.requestReturnOrder(req.params.id, req.user, req.body.reason, req.body.images);
    return response.success(res, {
        message: "Return request submitted successfully",
        order,
    });
}));
router.get("/track/:code", catchAsync(async (req, res) => {
    const order = await orderService.trackOrder(req.params.code);
    return response.success(res, { order });
}));
router.get("/my-orders", authenticate, catchAsync(async (req, res) => {
    const result = await orderService.getMyOrders(req.user._id.toString());
    return response.success(res, { orders: result });
}));
router.get("/:id", authenticate, catchAsync(async (req, res) => {
    const order = await orderService.getOrder(req.params.id, req.user);
    return response.success(res, { order });
}));
export default router;
