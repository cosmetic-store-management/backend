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
    await logAction(req.user._id.toString(), req.user.name, "update", "sales", `Cập nhật trạng thái đơn hàng "${order.code}" thành "${order.orderStatus}"`, req.ip || "127.0.0.1");
    return response.success(res, {
        message: "Cập nhật đơn hàng thành công",
        order,
    });
}));
router.patch("/admin/:id/details", authenticate, requirePermission("orders.manage"), validate(UpdateOrderDetailsSchema), catchAsync(async (req, res) => {
    const order = await orderService.updateOrderDetailsAdmin(req.params.id, req.body);
    await logAction(req.user._id.toString(), req.user.name, "update", "sales", `Cập nhật chi tiết giao hàng cho đơn "${order.code}"`, req.ip || "127.0.0.1");
    return response.success(res, {
        message: "Cập nhật chi tiết đơn hàng thành công",
        order,
    });
}));
router.patch("/admin/:id/refund", authenticate, requirePermission("orders.manage"), catchAsync(async (req, res) => {
    const order = await orderService.refundOrderAdmin(req.params.id);
    await logAction(req.user._id.toString(), req.user.name, "update", "sales", `Xác nhận đã chuyển khoản hoàn tiền thủ công cho đơn "${order.code}"`, req.ip || "127.0.0.1");
    return response.success(res, {
        message: "Xác nhận hoàn tiền thành công",
        order,
    });
}));
router.patch("/admin/:id/return/approve", authenticate, requirePermission("orders.manage"), catchAsync(async (req, res) => {
    const order = await orderService.approveReturnOrder(req.params.id, req.user);
    await logAction(req.user._id.toString(), req.user.name, "update", "sales", `Duyệt yêu cầu trả hàng cho đơn "${order.code}"`, req.ip || "127.0.0.1");
    return response.success(res, { message: "Duyệt yêu cầu trả hàng thành công", order });
}));
router.patch("/admin/:id/return/reject", authenticate, requirePermission("orders.manage"), catchAsync(async (req, res) => {
    const order = await orderService.rejectReturnOrder(req.params.id, req.user, req.body.rejectReason);
    await logAction(req.user._id.toString(), req.user.name, "update", "sales", `Từ chối yêu cầu trả hàng cho đơn "${order.code}". Lý do: ${req.body.rejectReason}`, req.ip || "127.0.0.1");
    return response.success(res, { message: "Từ chối trả hàng thành công", order });
}));
// ── PUBLIC / CUSTOMER ─────────────────────────────────────────────────────────
// Khách hàng tự hủy đơn (chỉ khi pending)
router.patch("/:id/cancel", authenticate, isAuthenticated, catchAsync(async (req, res) => {
    const order = await orderService.cancelOrder(req.params.id, req.user);
    return response.success(res, { message: "Hủy đơn hàng thành công", order });
}));
// Khách hàng yêu cầu trả hàng (khi completed)
router.patch("/:id/return", authenticate, isAuthenticated, catchAsync(async (req, res) => {
    const order = await orderService.requestReturnOrder(req.params.id, req.user, req.body.reason, req.body.images);
    return response.success(res, {
        message: "Yêu cầu trả hàng đã được gửi thành công",
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
