import { injectable, inject } from "tsyringe";
import { catchAsync } from "../../../shared/helpers/catchAsync.js";
import * as response from "../../../shared/helpers/response.js";
import { OrderService } from "./order.service.js";
import { AuditLogService } from "../../identity/audit-log/audit-log.service.js";

@injectable()
export class OrderController {
  constructor(
    @inject(OrderService) private readonly orderService: OrderService,
    @inject(AuditLogService) private readonly auditService: AuditLogService
  ) {}

  getAdminList = catchAsync(async (req, res) => {
    const result = await this.orderService.getOrdersForAdmin(req.query as any);
    return response.success(res, result);
  });

  patchAdminIdStatus = catchAsync(async (req, res) => {
    const order = await this.orderService.updateOrderStatus(
      req.params.id as string,
      req.body,
      req.user!
    );
    await this.auditService.logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "sales",
      `Updated order status "${order.code}" to "${order.orderStatus}"`,
      req.ip || "127.0.0.1"
    );
    return response.success(res, {
      message: "Order updated successfully",
      order,
    });
  });

  patchAdminIdDetails = catchAsync(async (req, res) => {
    const order = await this.orderService.updateOrderDetailsAdmin(
      req.params.id as string,
      req.body
    );
    await this.auditService.logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "sales",
      `Updated delivery details for order "${order.code}"`,
      req.ip || "127.0.0.1"
    );
    return response.success(res, {
      message: "Order details updated successfully",
      order,
    });
  });

  patchAdminIdRefund = catchAsync(async (req, res) => {
    const order = await this.orderService.refundOrderAdmin(
      req.params.id as string
    );
    await this.auditService.logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "sales",
      `Confirmed manual refund transfer for order "${order.code}"`,
      req.ip || "127.0.0.1"
    );
    return response.success(res, {
      message: "Refund confirmed successfully",
      order,
    });
  });

  patchAdminIdReturnApprove = catchAsync(async (req, res) => {
    const order = await this.orderService.approveReturnOrder(req.params.id as string, req.user!);
    await this.auditService.logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "sales",
      `Approved return request for order "${order.code}"`,
      req.ip || "127.0.0.1"
    );
    return response.success(res, { message: "Return request approved successfully", order });
  });

  patchAdminIdReturnReject = catchAsync(async (req, res) => {
    const order = await this.orderService.rejectReturnOrder(req.params.id as string, req.user!, req.body.rejectReason);
    await this.auditService.logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "sales",
      `Rejected return request for order "${order.code}". Reason: ${req.body.rejectReason}`,
      req.ip || "127.0.0.1"
    );
    return response.success(res, { message: "Return request rejected successfully", order });
  });

  postIdPosReturn = catchAsync(async (req, res) => {
    const { returnItems, returnReason } = req.body;
    const order = await this.orderService.processPOSReturn(
      req.params.id as string,
      req.user!,
      returnItems,
      returnReason
    );
    await this.auditService.logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "sales",
      `Processed POS return for order "${order.code}"`,
      req.ip || "127.0.0.1"
    );
    return response.success(res, { message: "POS Return processed successfully", order });
  });

  getAdminIdActivities = catchAsync(async (req, res) => {
    const activities = await this.orderService.getOrderActivities(req.params.id as string);
    return response.success(res, { activities });
  });

  patchIdCancel = catchAsync(async (req, res) => {
    const order = await this.orderService.cancelOrder(
      req.params.id as string,
      req.user!
    );
    return response.success(res, { message: "Order cancelled successfully", order });
  });

  patchIdReturn = catchAsync(async (req, res) => {
    const order = await this.orderService.requestReturnOrder(
      req.params.id as string,
      req.user!,
      req.body.reason,
      req.body.images
    );
    return response.success(res, {
      message: "Return request submitted successfully",
      order,
    });
  });

  getTrackCode = catchAsync(async (req, res) => {
    const order = await this.orderService.trackOrder(req.params.code as string);
    return response.success(res, { order });
  });

  getMyOrders = catchAsync(async (req, res) => {
    const result = await this.orderService.getMyOrders(req.user!._id.toString());
    return response.success(res, { orders: result });
  });

  getId = catchAsync(async (req, res) => {
    const order = await this.orderService.getOrder(
      req.params.id as string,
      req.user!
    );
    return response.success(res, { order });
  });
}