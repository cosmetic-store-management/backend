import Order, { OrderDocument } from "./models/order.schema.js";
import * as orderRepo from "./order.repository.js";
import { mapOrder, mapPublicOrder } from "./dto/order.response.dto.js";

import * as inventoryRepo from "../inventory/inventory.repository.js";
import {
  notFound,
  forbidden,
  badRequest,
} from "../../shared/errors/httpErrors.js";
import User, { UserDocument } from "../user/models/user.schema.js";
import {
  UpdateOrderStatusInput,
  UpdateOrderDetailsInput,
} from "./dto/order.request.dto.js";
import mongoose from "mongoose";
import {
  decrementVoucherUsage,
} from "../voucher/voucher.service.js";
import { refundPayment } from "./payment/payment.service.js";
import PointHistory from "../user/models/point-history.schema.js";
import Product from "../product/models/product.schema.js";

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
} from "../../shared/email/email.service.js";

// Re-export helpers for backward compatibility
export { POINTS_EARN_RATE, MAX_POINTS_PCT, ALLOWED_TRANSITIONS };

export const attachItemsToOrders = async (orders: OrderDocument[]) => {
  if (orders.length === 0) return [];
  return orders.map((order) => mapOrder(order, (order as any).items || []));
};

export const restoreStock = async (items: any[], session?: mongoose.ClientSession): Promise<void> => {
  // Sort by variantId to prevent Deadlock when locking multiple variant documents
  const sortedItems = [...items].sort((a, b) =>
    (a.variantId || "").toString().localeCompare((b.variantId || "").toString())
  );
  for (const item of sortedItems) {
    if (item.variantId) {
      await orderRepo.incrementVariantStock(
        item.variantId.toString(),
        item.quantity,
        session
      );

      // Create a restorative batch using the average cost of the item from the order
      const avgCostPrice = item.quantity > 0 && item.costPriceTotal > 0
        ? item.costPriceTotal / item.quantity
        : 0;

      await inventoryRepo.createBatch(
        {
          variantId: item.variantId,
          goodsReceiptId: null,
          importPrice: avgCostPrice,
          originalQty: item.quantity,
          remainingQty: item.quantity,
        },
        session
      );
    }
  }
};

// ── Source: order-query.service.ts ──────────────────────────────
interface AdminOrderQuery {
  orderStatus?: string;
  channel?: string;
  userId?: string;
  search?: string;
  cursor?: string;
  limit?: number;
  paymentStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  shopId?: string | null;
}

export const getOrdersForAdmin = async ({
  orderStatus,
  channel,
  userId,
  search,
  cursor,
  limit = 20,
  paymentStatus,
  dateFrom,
  dateTo,
  shopId,
}: AdminOrderQuery) => {
  const parsedLimit = Math.max(Number(limit) || 20, 1);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {};
  if (shopId !== undefined) {
    const { default: mongoose } = await import("mongoose");
    query.shopId = shopId ? new mongoose.Types.ObjectId(shopId) : null;
  }
  if (orderStatus) query.orderStatus = orderStatus;
  if (channel) query.channel = channel;
  if (userId) query.userId = userId;
  if (paymentStatus) query.paymentStatus = paymentStatus;
  if (search) {
    query.$or = [
      { code: { $regex: search, $options: "i" } },
      { receiverName: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
    ];
  }

  if (!orderStatus && !search) {
    query.note = { $ne: "Hệ thống tự động hủy do quá hạn thanh toán" };
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
    orderRepo.findOrders(query, cursor || null, parsedLimit),
    orderRepo.countOrders(query),
  ]);

  const mappedOrders = await attachItemsToOrders(result.orders);
  return {
    orders: mappedOrders,
    pagination: {
      limit: parsedLimit,
      total,
      nextCursor: result.nextCursor,
      hasNextPage: result.hasNextPage,
    },
  };
};

export const getMyOrders = async (userId: string) => {
  const orders = await orderRepo.findOrdersByUserId(userId);
  return attachItemsToOrders(orders);
};

export const getOrder = async (orderId: string, requestUser: UserDocument) => {
  const order = await orderRepo.findOrderById(orderId);
  if (!order) throw notFound("Không tìm thấy đơn hàng");

  const isAdmin = requestUser.role === "owner" || requestUser.role === "staff";
  const isOwner = String(order.userId) === String(requestUser._id);
  if (!isAdmin && !isOwner)
    throw forbidden("Bạn không có quyền truy cập đơn hàng này");

  const items = (order as any).items || [];
  return mapOrder(order, items);
};

export const trackOrder = async (orderCode: string) => {
  const order = await orderRepo.findOne({ code: orderCode.toUpperCase() });
  if (!order) throw notFound("Không tìm thấy đơn hàng");

  const items = (order as any).items || [];
  return mapPublicOrder(order, items);
};

// ── Source: order-management.service.ts ──────────────────────────────
export const updateOrderStatus = async (
  orderId: string,
  data: UpdateOrderStatusInput & {
    receiverName?: string;
    phone?: string;
    transactionId?: string;
  },
  requestUser: UserDocument,
  shopId?: string | null,
) => {
  const query: any = { _id: orderId };
  if (shopId) query.shopId = new mongoose.Types.ObjectId(shopId);

  let order: any = await orderRepo.findOne(query);
  if (!order)
    throw notFound(
      "Không tìm thấy đơn hàng hoặc đơn hàng không thuộc hệ thống của bạn",
    );

  if (
    data.orderStatus !== undefined &&
    data.orderStatus !== order.orderStatus &&
    !ALLOWED_TRANSITIONS[order.orderStatus]?.includes(data.orderStatus)
  ) {
    throw badRequest("Không thể chuyển trạng thái đơn hàng như yêu cầu");
  }
  const previousStatus = order.orderStatus;

  if (data.orderStatus) {
    if (data.orderStatus === "completed" && previousStatus !== "completed") {
      order.completedAt = new Date();
    }

    order.orderStatus = data.orderStatus;
  }

  if (data.transactionId !== undefined) {
    order.transactionId = data.transactionId.trim();
  }

  if (data.receiverName !== undefined) {
    const normalized = data.receiverName.trim();
    if (!normalized) throw badRequest("Tên người nhận không được để trống");
    order.receiverName = normalized;
  }
  if (data.phone !== undefined) {
    const normalized = data.phone.trim();
    if (!normalized) throw badRequest("Số điện thoại không được để trống");
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

    const updatedOrder = await orderRepo.findOneAndUpdateOrder(
      { _id: order._id, orderStatus: previousStatus },
      { $set: updateObj },
      { session, new: true }
    );

    if (!updatedOrder) {
      throw badRequest("Đơn hàng đã được xử lý bởi một tiến trình khác. Vui lòng thử lại.");
    }

    order = updatedOrder as any;

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

      await restoreStock(items, session);
      if (order.voucherCode) {
        await decrementVoucherUsage(order.voucherCode, order.userId?.toString(), session);
      }

      if (order.userId) {
        const userDoc = await User.findById(order.userId);
        if (userDoc) {
          const incQuery: any = {};
          let changed = false;

          if ((order.usedPoints || 0) > 0) {
            incQuery.points = (incQuery.points || 0) + order.usedPoints;
            await PointHistory.create([{
              userId: userDoc._id,
              pointsChanged: order.usedPoints,
              reason: `Hoàn điểm do đơn hàng #${order.code} bị ${data.orderStatus === "cancelled" ? "hủy" : "trả lại"}`,
              performedBy: requestUser?._id,
            }], { session });
            order.usedPoints = 0;
            changed = true;
          }

          if (
            previousStatus === "completed" &&
            order.earnedPoints &&
            order.earnedPoints > 0
          ) {
            incQuery.points = (incQuery.points || 0) - order.earnedPoints;
            await PointHistory.create([{
              userId: userDoc._id,
              pointsChanged: -order.earnedPoints,
              reason: `Thu hồi điểm do đơn hàng #${order.code} bị ${data.orderStatus === "cancelled" ? "hủy" : "trả lại"}`,
              performedBy: requestUser?._id,
            }], { session });
            order.earnedPoints = 0;
            changed = true;
          }

          if (changed) {
            await User.findByIdAndUpdate(
              userDoc._id,
              [{ $set: { points: { $max: [0, { $add: ["$points", incQuery.points || 0] }] } } }],
              { session }
            );
            await orderRepo.saveOrder(order, session);
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
            await Product.findByIdAndUpdate(item.productId, {
              $inc: { soldCount: -item.quantity },
            }, { session });
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
        const userDoc = await User.findById(order.userId);
        if (userDoc) {
          const orderSettings = await getOrderSettings();
          // Tích điểm: 1 điểm mỗi POINTS_EARN_RATE VND (hiện tại từ cài đặt)
          const pointsEarned = Math.floor(
            order.totalAmount / orderSettings.pointsEarnRate,
          );

          await User.findByIdAndUpdate(userDoc._id, { $inc: { points: pointsEarned } }, { session });

          await PointHistory.create([{
            userId: userDoc._id,
            pointsChanged: pointsEarned,
            reason: `Hoàn thành đơn hàng #${order.code} (Tích luỹ)`,
            performedBy: requestUser._id,
          }], { session });

          order.earnedPoints = pointsEarned;
          await orderRepo.saveOrder(order, session);
        }
      }

      // Tăng số lượng đã bán (soldCount) cho các sản phẩm trong đơn hàng
      const sortedProducts = [...items].sort((a, b) =>
        (a.productId || "").toString().localeCompare((b.productId || "").toString())
      );
      for (const item of sortedProducts) {
        if (item.productId) {
          await Product.findByIdAndUpdate(item.productId, {
            $inc: { soldCount: item.quantity },
          }, { session });
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
    const emailUser = await User.findById(order.userId).select("email");
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

export const requestReturnOrder = async (
  orderId: string,
  requestUser: UserDocument,
  reason: string,
  images?: string[],
) => {
  if (!reason || reason.trim() === "") {
    throw badRequest("Vui lòng nhập lý do trả hàng");
  }

  const order = await orderRepo.findOrderById(orderId);
  if (!order) throw notFound("Không tìm thấy đơn hàng");

  if (order.userId?.toString() !== requestUser._id.toString())
    throw forbidden("Không có quyền thực hiện");

  if (order.orderStatus !== "completed") {
    throw badRequest("Chỉ có thể yêu cầu trả hàng cho đơn hàng đã hoàn tất");
  }

  // Fallback completedAt to updatedAt if not available
  const completionDate = order.completedAt || order.updatedAt;
  const daysSinceCompletion = (Date.now() - new Date(completionDate).getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceCompletion > 15) {
    throw badRequest("Đã quá thời hạn 15 ngày để yêu cầu trả hàng");
  }

  order.orderStatus = "return_pending";
  order.returnReason = reason.trim();
  order.returnImages = images || [];
  order.returnRequestedAt = new Date();
  await order.save();

  return mapOrder(order, (order as any).items || []);
};

export const approveReturnOrder = async (orderId: string, _requestUser: UserDocument) => {
  const order = await orderRepo.findOrderById(orderId);
  if (!order) throw notFound("Không tìm thấy đơn hàng");

  if (order.orderStatus !== "return_pending") {
    throw badRequest("Đơn hàng không ở trạng thái yêu cầu trả hàng");
  }

  // Chuyển trạng thái sang returned và refund_pending
  order.orderStatus = "returned";
  if (order.paymentStatus === "paid") {
    order.paymentStatus = "refund_pending";
  }

  await order.save();

  // Gửi email
  if (order.userId) {
    const emailUser = await User.findById(order.userId).select("email");
    if (emailUser?.email) {
      sendOrderReturnedEmail(emailUser.email, order.code).catch(console.error);
    }
  }

  return mapOrder(order, (order as any).items || []);
};

export const rejectReturnOrder = async (orderId: string, _requestUser: UserDocument, rejectReason: string) => {
  if (!rejectReason || rejectReason.trim() === "") {
    throw badRequest("Vui lòng nhập lý do từ chối");
  }

  const order = await orderRepo.findOrderById(orderId);
  if (!order) throw notFound("Không tìm thấy đơn hàng");

  if (order.orderStatus !== "return_pending") {
    throw badRequest("Đơn hàng không ở trạng thái yêu cầu trả hàng");
  }

  // Khôi phục lại trạng thái completed
  order.orderStatus = "completed";
  order.returnRejectReason = rejectReason.trim();
  await order.save();

  // Gửi email từ chối
  if (order.userId) {
    const emailUser = await User.findById(order.userId).select("email");
    if (emailUser?.email) {
      sendOrderReturnRejectedEmail(emailUser.email, order.code).catch(console.error);
    }
  }

  return mapOrder(order, (order as any).items || []);
};

export const cancelOrder = async (
  orderId: string,
  requestUser: UserDocument,
) => {
  let order: any = await orderRepo.findOrderById(orderId);
  if (!order) throw notFound("Không tìm thấy đơn hàng");

  const isAdmin = ["owner", "manager", "staff"].includes(requestUser.role);
  const isOwner = String(order.userId) === String(requestUser._id);
  if (!isAdmin && !isOwner)
    throw forbidden("Bạn không có quyền thao tác đơn hàng này");

  if (order.orderStatus !== "pending")
    throw badRequest("Chỉ có thể hủy đơn hàng đang chờ xử lý");

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const updatedOrder = await orderRepo.findOneAndUpdateOrder(
      { _id: order._id, orderStatus: "pending" },
      { $set: { orderStatus: "cancelled" } },
      { session, new: true }
    );

    if (!updatedOrder) {
      throw badRequest("Đơn hàng đã được xử lý hoặc không còn ở trạng thái chờ.");
    }

    order = updatedOrder as any;

    const items = (order as any).items || [];
    await restoreStock(items, session);

    if (order.voucherCode) {
      await decrementVoucherUsage(order.voucherCode, order.userId?.toString(), session);
    }

    if ((order.usedPoints || 0) > 0 && order.userId) {
      const userDoc = await User.findById(order.userId);
      if (userDoc) {
        await User.findByIdAndUpdate(userDoc._id, { $inc: { points: order.usedPoints } }, { session });
        await PointHistory.create([{
          userId: userDoc._id,
          pointsChanged: order.usedPoints,
          reason: `Hoàn điểm do đơn hàng #${order.code} bị hủy`,
          performedBy: requestUser?._id,
        }], { session });
        order.usedPoints = 0;
        await orderRepo.saveOrder(order, session);
      }
    }

    await session.commitTransaction();
  } catch (error: any) {
    await session.abortTransaction();
    throw badRequest(error.message || "Lỗi khi hủy đơn hàng");
  } finally {
    await session.endSession();
  }

  if (order.userId) {
    const user = await User.findById(order.userId);
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

export const cancelPendingOrder = async (
  orderCode: string,
  reason: string = "Khách hàng hủy thanh toán"
) => {
  let order: any = await orderRepo.findOne({ code: orderCode.toUpperCase() });
  if (!order) throw notFound("Không tìm thấy đơn hàng");

  if (order.orderStatus !== "pending")
    throw badRequest("Chỉ có thể hủy đơn hàng đang chờ xử lý");

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // We can use note to store cancellation reason if we want, or just leave it.
    const note = order.note ? order.note : reason;
    const updatedOrder = await orderRepo.findOneAndUpdateOrder(
      { _id: order._id, orderStatus: "pending" },
      { $set: { orderStatus: "cancelled", note } },
      { session, new: true }
    );

    if (!updatedOrder) {
      throw badRequest("Đơn hàng đã được xử lý hoặc không còn ở trạng thái chờ.");
    }

    order = updatedOrder as any;

    const items = (order as any).items || [];
    await restoreStock(items, session);

    if (order.voucherCode) {
      await decrementVoucherUsage(order.voucherCode, order.userId?.toString(), session);
    }

    if ((order.usedPoints || 0) > 0 && order.userId) {
      const userDoc = await User.findById(order.userId);
      if (userDoc) {
        await User.findByIdAndUpdate(userDoc._id, { $inc: { points: order.usedPoints } }, { session });
        await PointHistory.create([{
          userId: userDoc._id,
          pointsChanged: order.usedPoints,
          reason: `Hoàn điểm do đơn hàng #${order.code} bị hủy (${reason})`,
          // performedBy is null or user id
        }], { session });
        order.usedPoints = 0;
        await orderRepo.saveOrder(order, session);
      }
    }

    await session.commitTransaction();
  } catch (error: any) {
    await session.abortTransaction();
    throw badRequest(error.message || "Lỗi khi hủy đơn hàng chờ thanh toán");
  } finally {
    await session.endSession();
  }

  if (order && order.userId) {
    const user = await User.findById(order.userId);
    if (user && user.email) {
      sendOrderCancelledEmail(user.email, order.code).catch(console.error);
    }
  }

  return mapOrder(order as any, (order as any).items || []);
};

export const abandonPendingOrder = async (orderCode: string) => {
  const order = await orderRepo.findOne({ code: orderCode.toUpperCase() });
  if (!order) throw notFound("Không tìm thấy đơn hàng");

  if (order.orderStatus !== "pending")
    throw badRequest("Chỉ có thể hủy đơn hàng đang chờ xử lý");

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const items = (order as any).items || [];
    await restoreStock(items, session);

    if (order.voucherCode) {
      await decrementVoucherUsage(order.voucherCode, order.userId?.toString(), session);
    }

    if ((order.usedPoints || 0) > 0 && order.userId) {
      const userDoc = await User.findById(order.userId);
      if (userDoc) {
        await User.findByIdAndUpdate(userDoc._id, { $inc: { points: order.usedPoints } }, { session });
        await PointHistory.create([{
          userId: userDoc._id,
          pointsChanged: order.usedPoints,
          reason: `Hoàn điểm do hủy mã QR thanh toán đơn hàng #${order.code}`,
        }], { session });
      }
    }

    // Hard delete the abandoned order so it doesn't pollute the system
    await Order.findByIdAndDelete(order._id, { session });

    await session.commitTransaction();
  } catch (error: any) {
    await session.abortTransaction();
    throw badRequest(error.message || "Lỗi khi hủy QR thanh toán");
  } finally {
    await session.endSession();
  }

  return { success: true, message: "Đã hủy mã QR thanh toán" };
};

export const updateOrderDetailsAdmin = async (
  orderId: string,
  data: UpdateOrderDetailsInput,
) => {
  const order = await orderRepo.findOne({ _id: orderId });
  if (!order) throw notFound("Không tìm thấy đơn hàng");

  if (["completed", "cancelled", "returned"].includes(order.orderStatus)) {
    throw badRequest("Không thể sửa thông tin đơn hàng đã đóng");
  }

  const updatedOrder = await orderRepo.findOneAndUpdateOrder(
    { _id: orderId },
    { $set: data },
    { new: true }
  );

  if (!updatedOrder) throw badRequest("Lỗi khi cập nhật đơn hàng");
  return mapOrder(updatedOrder as any, (updatedOrder as any).items || []);
};

export const refundOrderAdmin = async (
  orderId: string,
) => {
  const order = await orderRepo.findOne({ _id: orderId });
  if (!order) throw notFound("Không tìm thấy đơn hàng");

  if (order.paymentStatus !== "refund_pending") {
    throw badRequest("Đơn hàng này không ở trạng thái chờ hoàn tiền");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const updateObj: any = { paymentStatus: "refunded" };
    // Nếu đơn hàng chưa ở trạng thái returned hoặc cancelled thì đổi sang returned
    if (!["cancelled", "returned"].includes(order.orderStatus)) {
      updateObj.orderStatus = "returned";
    }

    const updatedOrder = await orderRepo.findOneAndUpdateOrder(
      { _id: orderId, paymentStatus: "refund_pending" },
      { $set: updateObj },
      { session, new: true }
    );

    if (!updatedOrder) {
      throw badRequest("Lỗi khi hoàn tiền, trạng thái đơn hàng có thể đã thay đổi");
    }

    if (!["cancelled", "returned", "return_pending"].includes(order.orderStatus)) {
      const items = (updatedOrder as any).items || [];
      await restoreStock(items, session);
    }

    await session.commitTransaction();
    return mapOrder(updatedOrder as any, (updatedOrder as any).items || []);
  } catch (error: any) {
    await session.abortTransaction();
    throw badRequest(error.message || "Lỗi khi hoàn tiền đơn hàng");
  } finally {
    await session.endSession();
  }
};

export {
  getUserTotalSpent,
  previewOrder,
  createOrder,
  createPOSOrder,
} from "./checkout/checkout.service.js";
