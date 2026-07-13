


import { catchAsync } from "../../shared/helpers/catchAsync.js";

import * as response from "../../shared/helpers/response.js";


import * as orderService from "./order.service.js";

import { logAction } from "../audit-log/audit-log.service.js";

export const getAdminList = catchAsync(async (req, res) => {
    const result = await orderService.getOrdersForAdmin(req.query as any);
    return response.success(res, result);
  });

export const patchAdminIdStatus = catchAsync(async (req, res) => {
    const order = await orderService.updateOrderStatus(
      req.params.id as string,
      req.body,
      req.user!,
    );
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "sales",
      `Updated order status "${order.code}" to "${order.orderStatus}"`,
      req.ip || "127.0.0.1",
    );
    return response.success(res, {
      message: "Order updated successfully",
      order,
    });
  });

export const patchAdminIdDetails = catchAsync(async (req, res) => {
    const order = await orderService.updateOrderDetailsAdmin(
      req.params.id as string,
      req.body,
    );
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "sales",
      `Updated delivery details for order "${order.code}"`,
      req.ip || "127.0.0.1",
    );
    return response.success(res, {
      message: "Order details updated successfully",
      order,
    });
  });

export const patchAdminIdRefund = catchAsync(async (req, res) => {
    const order = await orderService.refundOrderAdmin(
      req.params.id as string,
    );
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "sales",
      `Confirmed manual refund transfer for order "${order.code}"`,
      req.ip || "127.0.0.1",
    );
    return response.success(res, {
      message: "Refund confirmed successfully",
      order,
    });
  });

export const patchAdminIdReturnApprove = catchAsync(async (req, res) => {
    const order = await orderService.approveReturnOrder(req.params.id as string, req.user!);
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "sales",
      `Approved return request for order "${order.code}"`,
      req.ip || "127.0.0.1",
    );
    return response.success(res, { message: "Return request approved successfully", order });
  });

export const patchAdminIdReturnReject = catchAsync(async (req, res) => {
    const order = await orderService.rejectReturnOrder(req.params.id as string, req.user!, req.body.rejectReason);
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "sales",
      `Rejected return request for order "${order.code}". Reason: ${req.body.rejectReason}`,
      req.ip || "127.0.0.1",
    );
    return response.success(res, { message: "Return request rejected successfully", order });
  });

export const postIdPosReturn = catchAsync(async (req, res) => {
    const { returnItems, returnReason } = req.body;
    const order = await orderService.processPOSReturn(
      req.params.id as string,
      req.user!,
      returnItems,
      returnReason,
    );
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "sales",
      `Processed POS return for order "${order.code}"`,
      req.ip || "127.0.0.1",
    );
    return response.success(res, { message: "POS Return processed successfully", order });
  });

export const getAdminIdActivities = catchAsync(async (req, res) => {
    const activities = await orderService.getOrderActivities(req.params.id as string);
    return response.success(res, { activities });
  });

export const patchIdCancel = catchAsync(async (req, res) => {
    const order = await orderService.cancelOrder(
      req.params.id as string,
      req.user!,
    );
    return response.success(res, { message: "Order cancelled successfully", order });
  });

export const patchIdReturn = catchAsync(async (req, res) => {
    const order = await orderService.requestReturnOrder(
      req.params.id as string,
      req.user!,
      req.body.reason,
      req.body.images,
    );
    return response.success(res, {
      message: "Return request submitted successfully",
      order,
    });
  });

export const getTrackCode = catchAsync(async (req, res) => {
    const order = await orderService.trackOrder(req.params.code as string);
    return response.success(res, { order });
  });

export const getMyOrders = catchAsync(async (req, res) => {
    const result = await orderService.getMyOrders(req.user!._id.toString());
    return response.success(res, { orders: result });
  });

export const getId = catchAsync(async (req, res) => {
    const order = await orderService.getOrder(
      req.params.id as string,
      req.user!,
    );
    return response.success(res, { order });
  });