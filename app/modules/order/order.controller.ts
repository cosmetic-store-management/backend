import { Router } from "express";
import { authenticate, authorize, isStaff, isAuthenticated } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { catchAsync } from "../../shared/helpers/catchAsync.js";
import * as response from "../../shared/helpers/response.js";
import { CreateOrderSchema, UpdateOrderStatusSchema, PreviewOrderSchema } from "./dto/order.request.dto.js";
import * as orderService from "./order.service.js";
import { logAction } from "../audit-log/audit-log.service.js";

const router = Router();

// â”€â”€ ADMIN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get("/admin/list", authenticate, isStaff, catchAsync(async (req, res) => {
  const result = await orderService.getOrdersForAdmin(req.query as any);
  return response.success(res, result);
}));

router.patch("/admin/:id/status", authenticate, isStaff, validate(UpdateOrderStatusSchema), catchAsync(async (req, res) => {
  const order = await orderService.updateOrderStatus(req.params.id as string, req.body, req.user!);
  await logAction(req.user!._id.toString(), req.user!.name, "update", "sales", `Cập nhật trạng thái đơn hàng "${order.code}" thành "${order.orderStatus}"`, req.ip || "127.0.0.1");
  return response.success(res, { message: "Cập nhật đơn hàng thành công", order });
}));



router.post("/pos", authenticate, isStaff, catchAsync(async (req, res) => {
  const order = await orderService.createPOSOrder(req.user!, req.body);
  await logAction(req.user!._id.toString(), req.user!.name, "checkout", "sales", `Bán lẻ POS đơn hàng "${order.code}" trị giá ${order.totalAmount.toLocaleString("vi-VN")}₫`, req.ip || "127.0.0.1");
  return response.created(res, { message: "Thành công", order });
}));

// ── PUBLIC / CUSTOMER ─────────────────────────────────────────────────────────

// Khách hàng tự hủy đơn (chỉ khi pending)
router.patch("/:id/cancel", authenticate, isAuthenticated, catchAsync(async (req, res) => {
  const order = await orderService.cancelOrder(req.params.id as string, req.user!);
  return response.success(res, { message: "Hủy đơn hàng thành công", order });
}));

router.get("/my-orders", authenticate, catchAsync(async (req, res) => {
  const result = await orderService.getMyOrders(req.user!._id.toString());
  return response.success(res, { orders: result });
}));

router.get("/:id", authenticate, catchAsync(async (req, res) => {
  const order = await orderService.getOrder(req.params.id as string, req.user!);
  return response.success(res, { order });
}));

router.post("/preview", authenticate, validate(PreviewOrderSchema), catchAsync(async (req, res) => {
  const result = await orderService.previewOrder(req.user!, req.body);
  return response.success(res, result);
}));

router.post("/", authenticate, validate(CreateOrderSchema), catchAsync(async (req, res) => {
  const order = await orderService.createOrder(req.user!, req.body);
  return response.created(res, { message: "Đặt hàng thành công", order });
}));

router.post("/:id/create-payment-url", authenticate, catchAsync(async (req, res) => {
  const ipAddr = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1";
  const result = await orderService.createVnpayUrl(req.params.id as string, req.user!, ipAddr as string);
  return response.success(res, result);
}));

// Webhook từ VNPay (không cần auth vì webhook gọi từ server VNPay)
router.get("/vnpay_ipn", catchAsync(async (req, res) => {
  const result = await orderService.handleVnpayIpn(req.query);
  // VNPay yêu cầu trả về HTTP status 200 với RspCode và Message
  return res.status(200).json(result);
}));

export default router;
