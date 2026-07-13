import Order, { OrderDocument } from "./models/order.schema.js";
import PaymentTransaction from "./models/payment-transaction.schema.js";
import { injectable, inject, container } from "tsyringe";
import { OrderRepository } from "./order.repository.js";
import { eventBus } from "../../shared/event-bus/index.js";
import type { UserDocument } from "../../identity/user/models/user.schema.js";
import { UserService } from "../../identity/user/user.service.js";
import { mapOrder, mapPublicOrder } from "./dto/order.response.dto.js";

import { InventoryRepository } from "../../catalog/inventory/inventory.repository.js";
import {
  notFound,
  forbidden,
  badRequest,
} from "../../../shared/errors/httpErrors.js";
import {
  UpdateOrderStatusInput,
  UpdateOrderDetailsInput,
} from "./dto/order.request.dto.js";
import mongoose from "mongoose";
import { VoucherService } from "../voucher/voucher.service.js";
import { refundPayment } from "./payment/payment.service.js";
import { logOrderActivity } from "./order-activity.service.js";

import {
  POINTS_EARN_RATE,
  MAX_POINTS_PCT,
  ALLOWED_TRANSITIONS,
  getOrderSettings,
} from "./checkout/checkout.helper.js";
import {
  sendOrderCancelledEmail,
  sendOrderShippedEmail,
  sendOrderReturnedEmail,
  sendOrderReturnRejectedEmail,
  sendOrderCompletedEmail
} from "../../../shared/email/email.service.js";

// Re-export helpers for backward compatibility
export { POINTS_EARN_RATE, MAX_POINTS_PCT, ALLOWED_TRANSITIONS };

interface AdminOrderQuery {
  orderStatus?: string;
  channel?: string;
  userId?: string;
  search?: string;
  page?: number;
  limit?: number;
  paymentStatus?: string;
  dateFrom?: string;
  dateTo?: string;
}

export {
  getOrderActivities,
  logOrderActivity,
} from "./order-activity.service.js";
import { getOrderActivities } from "./order-activity.service.js";

@injectable()
export class OrderService {
  public getOrderActivities = getOrderActivities;
  constructor(
    @inject(OrderRepository) private readonly orderRepo: OrderRepository,
    @inject(InventoryRepository) private readonly inventoryRepo: InventoryRepository,
    // use lazy/container for VoucherService to avoid cycle if needed, but lets just inject it
    @inject(VoucherService) private readonly voucherService: VoucherService
  ) {}

  attachItemsToOrders = async (orders: OrderDocument[]) => {
  if (orders.length === 0) return [];
  return orders.map((order) => mapOrder(order, (order as any).items || []));
};

  restoreStock = async (
  items: any[],
  session?: mongoose.ClientSession,
  operatorId?: string,
): Promise<void> => {
  // Sort by variantId to prevent Deadlock when locking multiple variant documents
  const sortedItems = [...items].sort((a, b) =>
    (a.variantId || "").toString().localeCompare((b.variantId || "").toString())
  );

  
  for (const item of sortedItems) {
    if (item.variantId) {
      await this.orderRepo.incrementVariantStock(
        item.variantId.toString(),
        item.quantity,
        session
      );

      const avgCostPrice = item.quantity > 0 && item.costPriceTotal > 0
        ? item.costPriceTotal / item.quantity
        : 0;

      await eventBus.emitAsync("inventory.stock.restored", {
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        avgCostPrice: avgCostPrice,
        price: item.price,
        operatorId: operatorId || "60c72b2f9b1d8b2c8c8b4567",
        session,
      });
    }
  }
};

// ── Source: order-query.service.ts ──────────────────────────────


  getOrdersForAdmin = async ({
  orderStatus,
  channel,
  userId,
  search,
  page = 1,
  limit = 20,
  paymentStatus,
  dateFrom,
  dateTo,
}: AdminOrderQuery) => {
  const parsedLimit = Math.max(Number(limit) || 20, 1);
  const parsedPage = Math.max(Number(page) || 1, 1);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {};
  if (orderStatus) query.orderStatus = orderStatus;
  if (channel) query.channel = channel;
  if (userId) query.userId = userId;
  if (paymentStatus) {
    if (paymentStatus === "refunded") {
      query.paymentStatus = { $in: ["refunded", "refund_pending"] };
    } else {
      query.paymentStatus = paymentStatus;
    }
  }
  if (search) {
    query.$or = [
      { code: { $regex: search, $options: "i" } },
      { receiverName: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
    ];
  }

  if (!orderStatus && !search) {
    query.note = { $ne: "System auto-cancelled due to payment timeout" };
  }

  // Filter theo ngày đặt (createdAt)
  if (dateFrom || dateTo) {
    query.createdAt = {};
    if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      query.createdAt.$lte = end;
    }
  }

  const [result, total] = await Promise.all([
    this.orderRepo.findOrders(query, parsedPage, parsedLimit),
    this.orderRepo.countOrders(query),
  ]);

  const mappedOrders = await this.attachItemsToOrders(result.orders);
  return {
    orders: mappedOrders,
    pagination: {
      limit: parsedLimit,
      total,
      page: result.page,
      totalPages: result.totalPages,
    },
  };
};

  getMyOrders = async (userId: string) => {
  const orders = await this.orderRepo.findOrdersByUserId(userId);
  return this.attachItemsToOrders(orders);
};

  getOrder = async (orderId: string, requestUser: UserDocument) => {
  const order = await this.orderRepo.findOrderById(orderId);
  if (!order) throw notFound("Order not found");

  const isAdmin = requestUser.role === "owner" || requestUser.role === "staff";
  const isOwner = String(order.userId) === String(requestUser._id);
  if (!isAdmin && !isOwner)
    throw forbidden("You do not have permission to access this order");

  const items = (order as any).items || [];
  return mapOrder(order, items);
};

  trackOrder = async (orderCode: string) => {
  const order = await this.orderRepo.findOne({ code: orderCode.toUpperCase() });
  if (!order) throw notFound("Order not found");

  const items = (order as any).items || [];
  return mapPublicOrder(order, items);
};

// ── Source: order-management.service.ts ──────────────────────────────
  updateOrderStatus = async (
  orderId: string,
  data: UpdateOrderStatusInput & {
    receiverName?: string;
    phone?: string;
    transactionId?: string;
  },
  requestUser: UserDocument,
) => {
  const query: any = { _id: orderId };

  let order: any = await this.orderRepo.findOne(query);
  if (!order)
    throw notFound(
      "Order not found or the order does not belong to your system",
    );

  if (
    data.orderStatus !== undefined &&
    data.orderStatus !== order.orderStatus &&
    !ALLOWED_TRANSITIONS[order.orderStatus]?.includes(data.orderStatus)
  ) {
    throw badRequest("Unable to change the order status as requested");
  }
  const previousStatus = order.orderStatus;

  if (data.orderStatus) {
    if (data.orderStatus === "completed" && previousStatus !== "completed") {
      order.completedAt = new Date();
    }
    if (data.orderStatus === "cancelled" && previousStatus !== "cancelled") {
      order.cancelledAt = new Date();
    }
    if (data.orderStatus === "returned" && previousStatus !== "returned") {
      order.returnedAt = new Date();
    }

    order.orderStatus = data.orderStatus;
  }

  if (data.transactionId !== undefined) {
    order.transactionId = data.transactionId.trim();
  }

  if (data.receiverName !== undefined) {
    const normalized = data.receiverName.trim();
    if (!normalized) throw badRequest("Recipient name is required");
    order.receiverName = normalized;
  }
  if (data.phone !== undefined) {
    const normalized = data.phone.trim();
    if (!normalized) throw badRequest("Phone number is required");
    order.phone = normalized;
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const updateObj: any = {
      orderStatus: order.orderStatus,
      transactionId: order.transactionId,
      receiverName: order.receiverName,
      phone: order.phone,
      completedAt: order.completedAt,
    };

    const updatedOrder = await this.orderRepo.findOneAndUpdateOrder(
      { _id: order._id, orderStatus: previousStatus },
      { $set: updateObj },
      { session, new: true }
    );

    if (!updatedOrder) {
      throw badRequest("The order was already processed by another process. Please try again.");
    }

    order = updatedOrder as any;

    if (data.orderStatus && data.orderStatus !== previousStatus) {
      await logOrderActivity(
        order._id,
        "status_changed",
        {
          statusFrom: previousStatus,
          statusTo: data.orderStatus,
          note: `Order status updated from ${previousStatus} to ${data.orderStatus}`,
          operatorId: requestUser._id,
          operatorName: requestUser.name,
        },
        session
      );
    }

    if (data.receiverName && data.receiverName !== order.receiverName) {
      await logOrderActivity(
        order._id,
        "detail_updated",
        {
          note: `Recipient updated from ${order.receiverName} to ${data.receiverName}`,
          operatorId: requestUser._id,
          operatorName: requestUser.name,
        },
        session
      );
    }

    const items = (order as any).items || [];

    // Logic hoàn trả hàng / hủy đơn -> trả lại kho
    if (
      (data.orderStatus === "cancelled" || data.orderStatus === "returned") &&
      previousStatus !== "cancelled" &&
      previousStatus !== "returned"
    ) {
      // Nếu đơn hàng đã thanh toán, chuyển trạng thái sang refund_pending để kế toán hoàn tiền tay
      if (order.paymentStatus === "paid") {
        order.paymentStatus = "refund_pending";
      }

      await this.restoreStock(items, session, requestUser?._id?.toString());
      if (order.voucherCode) {
        await this.voucherService.decrementVoucherUsage(order.voucherCode, order.userId?.toString(), session);
      }

      if (order.userId) {
        
        {
          const incQuery: any = {};
          let changed = false;

          if ((order.usedPoints || 0) > 0) {
            incQuery.points = (incQuery.points || 0) + order.usedPoints;
            await eventBus.emitAsync("user.points.added", {
              userId: order.userId,
              points: order.usedPoints,
              orderId: order._id,
              session
            });
            order.usedPoints = 0;
            changed = true;
          }

          if (
            previousStatus === "completed" &&
            order.earnedPoints &&
            order.earnedPoints > 0
          ) {
            const currentPoints = await container.resolve(UserService).getUserPoints(order.userId.toString());
            const pointsLeak = Math.max(0, order.earnedPoints - (currentPoints + (incQuery.points || 0)));
            if (pointsLeak > 0) {
              order.note = (order.note ? order.note + "\n" : "") + `[Hệ thống] Trừ ${pointsLeak.toLocaleString("vi-VN")}đ khỏi số tiền hoàn do khách đã tiêu điểm của đơn này.`;
            }

            incQuery.points = (incQuery.points || 0) - order.earnedPoints;
            await eventBus.emitAsync("user.points.added", {
              userId: order.userId,
              points: -order.earnedPoints,
              orderId: order._id,
              session
            });
            order.earnedPoints = 0;
            changed = true;
          }

          if (changed) {
            await this.orderRepo.saveOrder(order, session);
          }
        }
      }

      // Nếu đơn hàng trước đó đã hoàn thành thì trừ lại soldCount
      if (previousStatus === "completed") {
        const sortedProducts = [...items].sort((a, b) =>
          (a.productId || "").toString().localeCompare((b.productId || "").toString())
        );
        for (const item of sortedProducts) {
          if (item.productId) {
            await eventBus.emitAsync("product.soldCount.decremented", {
          productId: item.productId,
          quantity: item.quantity,
          session
        });
          }
        }
      }
    }

    // Logic CRM Tích điểm khi hoàn thành
    if (data.orderStatus === "completed" && previousStatus !== "completed") {
      if (order.paymentStatus !== "paid") {
        order.paymentStatus = "paid";
      }

      if (order.userId) {
        
        {
          const orderSettings = await getOrderSettings();
          // Tích điểm: 1 điểm mỗi POINTS_EARN_RATE VND (hiện tại từ cài đặt)
          const pointsEarned = Math.floor(
            order.totalAmount / orderSettings.pointsEarnRate,
          );

          await eventBus.emitAsync("user.points.added", {
          userId: order.userId,
          points: pointsEarned,
          orderId: order._id,
          session
        });

          order.earnedPoints = pointsEarned;
          await this.orderRepo.saveOrder(order, session);
        }
      }

      // Tăng số lượng đã bán (soldCount) cho các sản phẩm trong đơn hàng
      const sortedProducts = [...items].sort((a, b) =>
        (a.productId || "").toString().localeCompare((b.productId || "").toString())
      );
      for (const item of sortedProducts) {
        if (item.productId) {
          await eventBus.emitAsync("product.soldCount.incremented", {
          productId: item.productId,
          quantity: item.quantity,
          session
        });
        }
      }
    }

    await session.commitTransaction();
  } catch (error: any) {
    await session.abortTransaction();
    throw badRequest(error.message || "Lỗi khi cập nhật trạng thái đơn hàng");
  } finally {
    await session.endSession();
  }

  // ── Gửi email theo trạng thái ─────────────────────────────────────────────
  if (data.orderStatus && data.orderStatus !== previousStatus && order.userId) {
    const userService = container.resolve(UserService);
    const emailUser = await userService.getUserEmail(order.userId.toString());
    if (emailUser?.email) {
      if (data.orderStatus === "shipping") {
        sendOrderShippedEmail(
          emailUser.email,
          order.code,
          data.trackingCode,
        ).catch(console.error);
      } else if (data.orderStatus === "cancelled") {
        const isPaid = order.paymentStatus === "refund_pending" || order.paymentStatus === "paid";
        sendOrderCancelledEmail(emailUser.email, order.code, isPaid).catch(
          console.error,
        );
      } else if (data.orderStatus === "returned") {
        sendOrderReturnedEmail(emailUser.email, order.code).catch(
          console.error,
        );
      } else if (data.orderStatus === "completed") {
        if (previousStatus === "return_pending") {
          sendOrderReturnRejectedEmail(emailUser.email, order.code).catch(
            console.error,
          );
        } else {
          sendOrderCompletedEmail(emailUser.email, order.code).catch(
            console.error,
          );
        }
      }
    }
  }

  return mapOrder(order, (order as any).items || []);
};

  requestReturnOrder = async (
  orderId: string,
  requestUser: UserDocument,
  reason: string,
  images?: string[],
) => {
  if (!reason || reason.trim() === "") {
    throw badRequest("Please enter a return reason");
  }

  const order = await this.orderRepo.findOrderById(orderId);
  if (!order) throw notFound("Order not found");

  if (order.userId?.toString() !== requestUser._id.toString())
    throw forbidden("You do not have permission to perform this action");

  if (order.orderStatus !== "completed") {
    throw badRequest("You can only request a return for a completed order");
  }

  // Fallback completedAt to updatedAt if not available
  const completionDate = order.completedAt || order.updatedAt;
  const daysSinceCompletion = (Date.now() - new Date(completionDate).getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceCompletion > 15) {
    throw badRequest("The 15-day return request window has expired");
  }

  order.orderStatus = "return_pending";
  order.returnReason = reason.trim();
  order.returnImages = images || [];
  order.returnRequestedAt = new Date();
  await order.save();

  return mapOrder(order, (order as any).items || []);
};

  approveReturnOrder = async (orderId: string, _requestUser: UserDocument) => {
  const order = await this.orderRepo.findOrderById(orderId);
  if (!order) throw notFound("Order not found");

  if (order.orderStatus !== "return_pending") {
    throw badRequest("The order is not in return request status");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Chuyển trạng thái sang returned và refund_pending
    order.orderStatus = "returned";
    if (order.paymentStatus === "paid") {
      order.paymentStatus = "refund_pending";
    }

    // Khôi phục kho
    const items = (order as any).items || [];
    await this.restoreStock(items, session, _requestUser?._id?.toString());

    // Xử lý Điểm
    if (order.userId) {
      
      {
        const incQuery: any = {};
        let changed = false;

        // Refund the points the customer used
        const usedPoints = order.usedPoints || 0;
        if (usedPoints > 0) {
          incQuery.points = (incQuery.points || 0) + usedPoints;
          await eventBus.emitAsync("user.points.added", {
              userId: order.userId,
              points: usedPoints,
              orderId: order._id,
              session
            });
          order.usedPoints = 0;
          changed = true;
        }

        // Revoke the points the customer earned
        const earnedPoints = order.earnedPoints || 0;
        if (earnedPoints > 0) {
          const currentPoints = await container.resolve(UserService).getUserPoints(order.userId.toString());
          const pointsLeak = Math.max(0, earnedPoints - (currentPoints + (incQuery.points || 0)));
          if (pointsLeak > 0) {
            order.note = (order.note ? order.note + "\n" : "") + `[Hệ thống] Trừ ${pointsLeak.toLocaleString("vi-VN")}đ khỏi số tiền hoàn do khách đã tiêu điểm của đơn này.`;
          }

          incQuery.points = (incQuery.points || 0) - earnedPoints;
          await eventBus.emitAsync("user.points.added", {
              userId: order.userId,
              points: -earnedPoints,
              orderId: order._id,
              session
            });
          order.earnedPoints = 0;
          changed = true;
        }

        if (changed) {
          await this.orderRepo.saveOrder(order, session);
        }
      }
    }

    // Giảm soldCount của sản phẩm vì hàng đã bị trả
    const sortedProducts = [...items].sort((a, b) =>
      (a.productId || "").toString().localeCompare((b.productId || "").toString())
    );
    for (const item of sortedProducts) {
      if (item.productId) {
        await eventBus.emitAsync("product.soldCount.decremented", {
          productId: item.productId,
          quantity: item.quantity,
          session
        });
      }
    }

    await this.orderRepo.saveOrder(order, session);
    await session.commitTransaction();
  } catch (error: any) {
    await session.abortTransaction();
    throw badRequest(error.message || "Failed to approve return request");
  } finally {
    await session.endSession();
  }

  // Gửi email
  if (order.userId) {
    const userService = container.resolve(UserService);
    const emailUser = await userService.getUserEmail(order.userId.toString());
    if (emailUser?.email) {
      sendOrderReturnedEmail(emailUser.email, order.code).catch(console.error);
    }
  }

  return mapOrder(order, (order as any).items || []);
};

  rejectReturnOrder = async (orderId: string, _requestUser: UserDocument, rejectReason: string) => {
  if (!rejectReason || rejectReason.trim() === "") {
    throw badRequest("Please enter a rejection reason");
  }

  const order = await this.orderRepo.findOrderById(orderId);
  if (!order) throw notFound("Order not found");

  if (order.orderStatus !== "return_pending") {
    throw badRequest("The order is not in return request status");
  }

  // Khôi phục lại trạng thái completed
  order.orderStatus = "completed";
  order.returnRejectReason = rejectReason.trim();
  await order.save();

  // Gửi email từ chối
  if (order.userId) {
    const userService = container.resolve(UserService);
    const emailUser = await userService.getUserEmail(order.userId.toString());
    if (emailUser?.email) {
      sendOrderReturnRejectedEmail(emailUser.email, order.code).catch(console.error);
    }
  }

  return mapOrder(order, (order as any).items || []);
};

  cancelOrder = async (
  orderId: string,
  requestUser: UserDocument,
) => {
  let order: any = await this.orderRepo.findOrderById(orderId);
  if (!order) throw notFound("Order not found");

  const isAdmin = ["owner", "manager", "staff"].includes(requestUser.role);
  const isOwner = String(order.userId) === String(requestUser._id);
  if (!isAdmin && !isOwner)
    throw forbidden("You do not have permission to manage this order");

  if (order.orderStatus !== "pending")
    throw badRequest("Only pending orders can be cancelled");

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const updatedOrder = await this.orderRepo.findOneAndUpdateOrder(
      { _id: order._id, orderStatus: "pending" },
      { $set: { orderStatus: "cancelled", cancelledAt: new Date() } },
      { session, new: true }
    );

    if (!updatedOrder) {
      throw badRequest("The order has already been processed or is no longer pending.");
    }

    order = updatedOrder as any;

    const items = (order as any).items || [];
    await this.restoreStock(items, session, requestUser?._id?.toString());

    if (order.voucherCode) {
      await this.voucherService.decrementVoucherUsage(order.voucherCode, order.userId?.toString(), session);
    }

    if ((order.usedPoints || 0) > 0 && order.userId) {
      
      {
        await eventBus.emitAsync("user.points.added", {
          userId: order.userId,
          points: order.usedPoints,
          orderId: order._id,
          session
        });
        order.usedPoints = 0;
        await this.orderRepo.saveOrder(order, session);
      }
    }

    await session.commitTransaction();
  } catch (error: any) {
    await session.abortTransaction();
    throw badRequest(error.message || "Failed to cancel the order");
  } finally {
    await session.endSession();
  }

  if (order.userId) {
    const userService = container.resolve(UserService);
    const user = await userService.getUserEmail(order.userId.toString());
    if (user && user.email) {
      sendOrderCancelledEmail(user.email, order.code).catch(console.error);
    }
  }

  if (order.paymentStatus === "paid") {
    // Process refund asynchronously or await it
    await refundPayment(order._id.toString()).catch(console.error);
  }

  return mapOrder(order, (order as any).items || []);
};

  cancelPendingOrder = async (
  orderCode: string,
  reason: string = "Khách hàng hủy thanh toán"
) => {
  let order: any = await this.orderRepo.findOne({ code: orderCode.toUpperCase() });
  if (!order) throw notFound("Order not found");

  if (order.orderStatus !== "pending")
    throw badRequest("Only pending orders can be cancelled");

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // We can use note to store cancellation reason if we want, or just leave it.
    const note = order.note ? order.note : reason;
    const updatedOrder = await this.orderRepo.findOneAndUpdateOrder(
      { _id: order._id, orderStatus: "pending" },
      { $set: { orderStatus: "cancelled", note } },
      { session, new: true }
    );

    if (!updatedOrder) {
      throw badRequest("The order has already been processed or is no longer pending.");
    }

    order = updatedOrder as any;

    const items = (order as any).items || [];
    await this.restoreStock(items, session, order.userId?.toString());

    if (order.voucherCode) {
      await this.voucherService.decrementVoucherUsage(order.voucherCode, order.userId?.toString(), session);
    }

    if ((order.usedPoints || 0) > 0 && order.userId) {
      await eventBus.emitAsync("user.points.added", {
        userId: order.userId,
        points: order.usedPoints,
        orderId: order._id,
        session
      });
      order.usedPoints = 0;
      await this.orderRepo.saveOrder(order, session);
    }

    await session.commitTransaction();
  } catch (error: any) {
    await session.abortTransaction();
    throw badRequest(error.message || "Failed to cancel the pending payment order");
  } finally {
    await session.endSession();
  }

  if (order && order.userId) {
    const userService = container.resolve(UserService);
    const user = await userService.getUserEmail(order.userId.toString());
    if (user && user.email) {
      sendOrderCancelledEmail(user.email, order.code).catch(console.error);
    }
  }

  return mapOrder(order as any, (order as any).items || []);
};

  abandonPendingOrder = async (orderCode: string) => {
  const order = await this.orderRepo.findOne({ code: orderCode.toUpperCase() });
  if (!order) throw notFound("Order not found");

  if (order.orderStatus !== "pending")
    throw badRequest("Only pending orders can be cancelled");

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const items = (order as any).items || [];
    await this.restoreStock(items, session, order.userId?.toString());

    if (order.voucherCode) {
      await this.voucherService.decrementVoucherUsage(order.voucherCode, order.userId?.toString(), session);
    }

    if ((order.usedPoints || 0) > 0 && order.userId) {
      await eventBus.emitAsync("user.points.added", {
        userId: order.userId,
        points: order.usedPoints,
        orderId: order._id,
        session
      });
    }

    // Soft cancel the abandoned order instead of hard delete
    order.orderStatus = "cancelled";
    order.note = order.note || "Khách hàng hủy thanh toán hoặc quá hạn";
    await this.orderRepo.saveOrder(order, session);

    await session.commitTransaction();
  } catch (error: any) {
    await session.abortTransaction();
    throw badRequest(error.message || "Failed to cancel the payment QR order");
  } finally {
    await session.endSession();
  }

  return mapOrder(order, (order as any).items || []);
};

  updateOrderDetailsAdmin = async (
  orderId: string,
  data: UpdateOrderDetailsInput,
) => {
  const order = await this.orderRepo.findOne({ _id: orderId });
  if (!order) throw notFound("Order not found");

  if (["completed", "cancelled", "returned"].includes(order.orderStatus)) {
    throw badRequest("Cannot edit a closed order");
  }

  const updatedOrder = await this.orderRepo.findOneAndUpdateOrder(
    { _id: orderId },
    { $set: data },
    { new: true }
  );

  if (!updatedOrder) throw badRequest("Failed to update the order");
  return mapOrder(updatedOrder as any, (updatedOrder as any).items || []);
};

  refundOrderAdmin = async (
  orderId: string,
) => {
  const order = await this.orderRepo.findOne({ _id: orderId });
  if (!order) throw notFound("Order not found");

  if (order.paymentStatus !== "refund_pending") {
    throw badRequest("This order is not in refund pending status");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const updateObj: any = { paymentStatus: "refunded" };
    // Nếu đơn hàng chưa ở trạng thái returned hoặc cancelled thì đổi sang returned
    if (!["cancelled", "returned"].includes(order.orderStatus)) {
      updateObj.orderStatus = "returned";
    }

    const updatedOrder = await this.orderRepo.findOneAndUpdateOrder(
      { _id: orderId, paymentStatus: "refund_pending" },
      { $set: updateObj },
      { session, new: true }
    );

    if (!updatedOrder) {
      throw badRequest("Failed to refund the order; its status may have changed");
    }

    await session.commitTransaction();
    return mapOrder(updatedOrder as any, (updatedOrder as any).items || []);
  } catch (error: any) {
    await session.abortTransaction();
    throw badRequest(error.message || "Failed to refund the order");
  } finally {
    await session.endSession();
  }
};

  processPOSReturn = async (
  orderId: string,
  requester: UserDocument,
  returnItems?: Array<{ productId: string; variantId: string; quantity: number }>,
  returnReason?: string,
) => {
  const order = await this.orderRepo.findOrderById(orderId);
  if (!order) throw notFound("Order not found");

  if (order.orderStatus === "returned") {
    throw badRequest("This order has already been returned");
  }

  let itemsToReturn: any[] = [];
  let refundAmount = 0;
  let pointsRefundTotal = 0;

  const usedPoints = order.usedPoints || 0;
  const cashPaid = order.totalAmount;
  const netTotal = cashPaid + usedPoints;

  if (returnItems && returnItems.length > 0) {
    for (const retItem of returnItems) {
      const originalItem = order.items.find(
        (i) => i.productId.toString() === retItem.productId && i.variantId.toString() === retItem.variantId
      );
      if (!originalItem) {
        throw badRequest(`Product variant ${retItem.variantId} was not part of the original order`);
      }
      if (retItem.quantity > originalItem.quantity) {
        throw badRequest(`Cannot return more than the originally purchased quantity (${originalItem.quantity})`);
      }
      
      const itemPrice = originalItem.price;
      const ratio = (itemPrice * retItem.quantity) / order.subtotal;
      const itemRefundVal = Math.round(itemPrice * retItem.quantity - order.discountAmount * ratio);
      
      const itemCashRefund = netTotal > 0 ? Math.round(itemRefundVal * (cashPaid / netTotal)) : 0;
      const itemPointsRefund = netTotal > 0 ? Math.round(itemRefundVal * (usedPoints / netTotal)) : 0;

      refundAmount += itemCashRefund;
      pointsRefundTotal += itemPointsRefund;

      itemsToReturn.push({
        productId: originalItem.productId,
        variantId: originalItem.variantId,
        productName: originalItem.productName,
        variantName: originalItem.variantName,
        price: originalItem.price,
        quantity: retItem.quantity,
        costPriceTotal: originalItem.quantity > 0 ? (originalItem.costPriceTotal / originalItem.quantity) * retItem.quantity : 0,
      });
    }
    order.orderStatus = "returned";
    order.returnedAt = new Date();
  } else {
    itemsToReturn = order.items;
    refundAmount = cashPaid;
    pointsRefundTotal = usedPoints;
    order.orderStatus = "returned";
    order.returnedAt = new Date();
  }

  if (returnReason && returnReason.trim()) {
    order.returnReason = returnReason.trim();
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    order.paymentStatus = "refunded";

    await this.restoreStock(itemsToReturn, session, requester?._id?.toString());

    if (order.userId) {
      
      {
        const incQuery: any = {};
        let changed = false;

        if (usedPoints > 0) {
          const pointsRefund = returnItems && returnItems.length > 0 
            ? pointsRefundTotal
            : usedPoints;
            
          if (pointsRefund > 0) {
            incQuery.points = (incQuery.points || 0) + pointsRefund;
            await eventBus.emitAsync("user.points.added", {
              userId: order.userId,
              points: pointsRefund,
              orderId: order._id,
              session
            });
            order.usedPoints = Math.max(0, usedPoints - pointsRefund);
            changed = true;
          }
        }

        const earnedPoints = order.earnedPoints || 0;
        if (earnedPoints > 0) {
          const pointsRevoke = returnItems && returnItems.length > 0
            ? Math.round(earnedPoints * (refundAmount / cashPaid))
            : earnedPoints;

          if (pointsRevoke > 0) {
            incQuery.points = (incQuery.points || 0) - pointsRevoke;
            await eventBus.emitAsync("user.points.added", {
              userId: order.userId,
              points: -pointsRevoke,
              orderId: order._id,
              session
            });
            order.earnedPoints = Math.max(0, earnedPoints - pointsRevoke);
            changed = true;
          }
        }

        if (changed) {
          await this.orderRepo.saveOrder(order, session);
        }
      }
    }

    for (const item of itemsToReturn) {
      if (item.productId) {
        await eventBus.emitAsync("product.soldCount.decremented", {
          productId: item.productId,
          quantity: item.quantity,
          session
        });
      }
    }

    await PaymentTransaction.create([{
      orderId: order._id,
      paymentMethod: order.paymentMethod,
      providerTransactionId: `REFUND-POS-${Date.now()}`,
      amount: refundAmount,
      currency: "VND",
      type: "refund",
      status: "success",
      metaData: { refundedBy: requester.name },
    }], { session });

    await logOrderActivity(
      order._id,
      "returned",
      {
        note: `POS order items returned and refunded successfully with total amount of ${refundAmount.toLocaleString("vi-VN")} VND. Reason: ${order.returnReason || "No reason specified"}`,
        operatorId: requester._id,
        operatorName: requester.name,
      },
      session
    );

    await this.orderRepo.saveOrder(order, session);
    await session.commitTransaction();
  } catch (error: any) {
    await session.abortTransaction();
    throw badRequest(error.message || "Failed to process POS return");
  } finally {
    await session.endSession();
  }

  return mapOrder(order, order.items);
};





}
