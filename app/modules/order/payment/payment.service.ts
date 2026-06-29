import Stripe from "stripe";
import Order from "../models/order.schema.js";
import User from "../../user/models/user.schema.js";
import PaymentTransaction from "../models/payment-transaction.schema.js";
import {
  notFound,
  badRequest,
} from "../../../shared/errors/httpErrors.js";
import { sendOrderSuccessEmail } from "../../../shared/email/email.service.js";
import mongoose from "mongoose";

// Lazy initialize Stripe so that dotenv has time to populate process.env
let stripeInstance: Stripe | null = null;
const getStripe = () => {
  if (!stripeInstance) {
    stripeInstance = new Stripe(
      process.env.STRIPE_SECRET_KEY || "sk_test_mock",
      {
        apiVersion: "2024-04-10" as any,
      },
    );
  }
  return stripeInstance;
};

export const createStripePaymentIntent = async (orderId: string) => {
  const order = await Order.findById(orderId);
  if (!order) throw notFound("Order not found");

  if (order.orderStatus !== "pending") {
    throw badRequest("Đơn hàng không ở trạng thái chờ thanh toán");
  }

  // VND is a zero-decimal currency in Stripe
  const amount = Math.round(order.totalAmount);

  // Create a PaymentIntent with the order amount and currency
  const paymentIntent = await getStripe().paymentIntents.create({
    amount,
    currency: "vnd",
    metadata: {
      orderId: order._id.toString(),
    },
  });

  return {
    clientSecret: paymentIntent.client_secret,
  };
};

export const handleStripeWebhook = async (payload: any, signature: string) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event: Stripe.Event;

  try {
    if (!webhookSecret) {
      if (process.env.NODE_ENV === "production") {
        throw badRequest("Thiếu STRIPE_WEBHOOK_SECRET trên môi trường Production");
      }
      // For local testing without signature verification if secret is missing
      event = JSON.parse(payload.toString());
    } else {
      event = getStripe().webhooks.constructEvent(
        payload,
        signature,
        webhookSecret,
      );
    }
  } catch (err: any) {
    throw badRequest(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case "payment_intent.succeeded": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const orderId = paymentIntent.metadata.orderId;

      if (orderId) {
        const order = await Order.findById(orderId);
      if (orderId) {
        // Start transaction FIRST to ensure Atomicity and use findOneAndUpdate to prevent Race Condition
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
          // Chỉ lấy và update nếu đơn hàng đang ở trạng thái pending
          const order = await Order.findOneAndUpdate(
            { _id: orderId, orderStatus: "pending" },
            { 
              $set: {
                orderStatus: "processing",
                paymentStatus: "paid",
                transactionId: paymentIntent.id
              }
            },
            { session, new: true }
          );

          if (order) {
            // Create payment transaction record
            await (PaymentTransaction as any).create([{
              orderId: order._id,
              amount: paymentIntent.amount,
              method: "stripe",
              status: "success",
              type: "charge",
              transactionId: paymentIntent.id,
              details: {
                paymentIntentId: paymentIntent.id,
                receiptUrl:
                  (paymentIntent.latest_charge as any)?.receipt_url ?? null,
              },
            }], { session });

            await session.commitTransaction();

            // Ghi log thanh toán thành công
            console.log(`[Stripe Webhook] Đơn hàng ${order.code} đã được thanh toán.`);

            // Gửi email xác nhận thanh toán thành công
            const emailUser = await User.findById(order.userId).select("email");
            if (emailUser && emailUser.email) {
              sendOrderSuccessEmail(emailUser.email, order.code, order.totalAmount).catch(console.error);
            }
          } else {
            // Đơn hàng không tồn tại hoặc không ở trạng thái pending (có thể đã được xử lý bởi cron huỷ đơn)
            const existingOrder = await Order.findById(orderId);
            if (existingOrder && existingOrder.orderStatus !== "pending" && existingOrder.paymentStatus !== "paid") {
              // Thanh toán thành công nhưng đơn đã huỷ -> Chuyển sang hoàn tiền
              existingOrder.paymentStatus = "refund_pending";
              await existingOrder.save({ session });
              
              await (PaymentTransaction as any).create([{
                orderId: existingOrder._id,
                amount: paymentIntent.amount,
                method: "stripe",
                status: "success", // Tiền đã vào tài khoản
                type: "charge",
                transactionId: paymentIntent.id,
                details: {
                  paymentIntentId: paymentIntent.id,
                  note: `Khách hàng đã thanh toán thành công nhưng đơn hàng đang ở trạng thái ${existingOrder.orderStatus}. Cần hoàn tiền.`
                },
              }], { session });
            }
            await session.commitTransaction();
          }
        } catch (error) {
          await session.abortTransaction();
          console.error("Lỗi khi xử lý Stripe webhook succeeded:", error);
          throw error;
        } finally {
          await session.endSession();
        }
      }
      }
      break;
    }
    case "payment_intent.payment_failed": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const orderId = paymentIntent.metadata.orderId;

      if (orderId) {
        await (PaymentTransaction as any).create({
          orderId,
          amount: paymentIntent.amount,
          method: "stripe",
          status: "failed",
          type: "charge",
          transactionId: paymentIntent.id,
          details: { error: paymentIntent.last_payment_error?.message },
        });
      }
      break;
    }
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  return true;
};

// --- SEPAY WEBHOOK (AUTO CONFIRM CHUYỂN KHOẢN NGÂN HÀNG) ---
import Setting from "../../setting/models/setting.schema.js";

export const handleSepayWebhook = async (payload: any, authHeader: string) => {
  // 1. Kiểm tra Token bảo mật (để chắc chắn request từ SePay)
  const webhookSetting = await Setting.findOne({ key: "global_settings" });
  const configuredToken = webhookSetting?.value?.sepayWebhookToken;
  
  if (!configuredToken) {
    throw badRequest("Hệ thống chưa cấu hình Token bảo mật cho SePay");
  }

  // SePay gửi API Key dạng "Apikey [TOKEN]" trong header Authorization
  const requestToken = authHeader?.replace("Apikey ", "")?.trim();
  if (requestToken !== configuredToken) {
    throw badRequest("Webhook Token không hợp lệ");
  }

  const { content, transferAmount } = payload;
  if (!content || !transferAmount) {
    throw badRequest("Payload thiếu content hoặc transferAmount");
  }

  // 2. Phân tích nội dung để tìm Mã Đơn Hàng. 
  // Cú pháp mặc định ta tạo trên VietQR là: GLOWUP [Mã Đơn]
  const match = content.match(/GLOWUP\s+([A-Z0-9]+)/i);
  if (!match) {
    // Không tìm thấy mã đơn hàng hợp lệ trong nội dung CK
    console.log(`[SePay Webhook] Bỏ qua giao dịch: Không khớp mã đơn - "${content}"`);
    return true; // Return true để SePay không gửi lại
  }

  const orderCode = match[1].toUpperCase();

  // 3. Cập nhật đơn hàng
  const order = await Order.findOne({ code: orderCode });
  if (!order) {
    console.log(`[SePay Webhook] Không tìm thấy mã đơn ${orderCode} trong hệ thống.`);
    return true; 
  }

  if (order.orderStatus !== "pending") {
    console.log(`[SePay Webhook] Đơn hàng ${orderCode} không ở trạng thái chờ thanh toán (hiện tại: ${order.orderStatus}). Cần Admin kiểm tra tay.`);
    
    // Nếu đơn hàng đã bị huỷ nhưng khách vẫn chuyển khoản, ghi nhận vào PaymentTransaction để Admin có thể xem lại
    if (order.paymentStatus !== "paid") {
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        order.paymentStatus = "refund_pending";
        await order.save({ session });
        
        await (PaymentTransaction as any).create([{
          orderId: order._id,
          amount: Number(transferAmount),
          method: "transfer",
          status: "success", // Tiền đã vào tài khoản
          type: "charge",
          transactionId: payload.referenceCode || payload.id || `SEPAY_${Date.now()}`,
          details: { rawPayload: payload, note: `Khách hàng chuyển khoản trễ khi đơn hàng đang ở trạng thái ${order.orderStatus}. Cần hoàn tiền.` },
        }], { session });
        await session.commitTransaction();
      } catch (error) {
        await session.abortTransaction();
        console.error("[SePay Webhook] Lỗi khi lưu log giao dịch trễ:", error);
      } finally {
        await session.endSession();
      }
    }
    return true;
  }

  if (order.paymentStatus === "paid") {
    return true;
  }

  // Nếu số tiền gửi >= số tiền cần thanh toán
  if (Number(transferAmount) >= order.totalAmount) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      // Dùng findOneAndUpdate để lock và tránh Race Condition nếu SePay gọi 2 webhooks cùng lúc
      const updatedOrder = await Order.findOneAndUpdate(
        { _id: order._id, orderStatus: "pending" },
        { 
          $set: { 
            orderStatus: "processing",
            paymentStatus: "paid"
          }
        },
        { session, new: true }
      );

      if (updatedOrder) {
        // Lưu transaction
        await (PaymentTransaction as any).create([{
          orderId: order._id,
          amount: Number(transferAmount),
          method: "transfer",
          status: "success",
          type: "charge",
          transactionId: payload.referenceCode || payload.id || `SEPAY_${Date.now()}`,
          details: { rawPayload: payload },
        }], { session });

        await session.commitTransaction();
        console.log(`[SePay Webhook] Xác nhận thanh toán thành công đơn ${orderCode}!`);
      } else {
        await session.commitTransaction(); // Có thể đã được update trước đó
      }
    } catch (error) {
      await session.abortTransaction();
      console.error("[SePay Webhook] Lỗi khi cập nhật đơn hàng:", error);
      throw error;
    } finally {
      await session.endSession();
    }
  } else {
    console.log(`[SePay Webhook] Số tiền CK (${transferAmount}) nhỏ hơn tổng đơn (${order.totalAmount}). Cần Admin kiểm tra tay.`);
    // Ghi nhận giao dịch thiếu tiền vào DB để Admin xử lý
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      await (PaymentTransaction as any).create([{
        orderId: order._id,
        amount: Number(transferAmount),
        method: "transfer",
        status: "pending",
        type: "charge",
        transactionId: payload.referenceCode || payload.id || `SEPAY_${Date.now()}`,
        details: { rawPayload: payload, note: `Chuyển khoản thiếu tiền: Gửi ${transferAmount}, cần ${order.totalAmount}` },
      }], { session });
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      console.error("[SePay Webhook] Lỗi khi lưu log giao dịch thiếu tiền:", error);
    } finally {
      await session.endSession();
    }
  }

  return true;
};

// --- LOOKUP BANK ACCOUNT NAME ---
export const lookupBankAccount = async (bin: string, accountNumber: string) => {
  const clientId = process.env.VIETQR_CLIENT_ID;
  const apiKey = process.env.VIETQR_API_KEY;

  if (!clientId || !apiKey) {
    // Nếu dev chưa cấu hình key thì mock ra tên demo
    return { accountName: "NGUYEN VAN A (DEMO)" };
  }

  try {
    const response = await fetch("https://api.vietqr.io/v2/lookup", {
      method: "POST",
      headers: {
        "x-client-id": clientId,
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ bin, accountNumber }),
    });
    
    const data = await response.json();
    if (data.code === "00" && data.data?.accountName) {
      return { accountName: data.data.accountName };
    }
    if (data.code === "47" || (data.desc && data.desc.includes("Free Plan"))) {
      throw new Error("Gói API VietQR miễn phí đã ngừng hỗ trợ tra cứu. Vui lòng nâng cấp tài khoản Casso/VietQR.");
    }
    throw new Error(data.desc || "Không tìm thấy thông tin tài khoản");
  } catch (error: any) {
    throw badRequest(error.message || "Lỗi khi tra cứu tài khoản");
  }
};

// --- REFUND PAYMENT ---
export const refundPayment = async (orderId: string, session?: mongoose.ClientSession) => {
  const order = await Order.findById(orderId).session(session || null);
  if (!order) throw notFound("Order not found");

  if (order.paymentStatus !== "paid") {
    return; // Không cần hoàn tiền nếu chưa thanh toán thành công
  }

  // Tìm giao dịch thanh toán thành công gần nhất
  const transaction = await PaymentTransaction.findOne({
    orderId: order._id,
    status: "success",
    type: "charge",
  }).session(session || null).sort({ createdAt: -1 });

  if (!transaction) {
    console.log(`[Refund] Không tìm thấy giao dịch thanh toán gốc cho đơn ${order.code}. Đánh dấu chờ xử lý tay.`);
    order.paymentStatus = "refund_pending";
    if (!session) {
      await order.save();
    }
    return;
  }

  try {
    if ((transaction as any).paymentMethod === "stripe") {
      const paymentIntentId = (transaction as any).details?.paymentIntentId;
      if (paymentIntentId) {
        // Stripe Refund API
        const refund = await getStripe().refunds.create({
          payment_intent: paymentIntentId,
          reason: "requested_by_customer"
        });

        // Tạo giao dịch Refund
        await (PaymentTransaction as any).create([{
          orderId: order._id,
          amount: refund.amount,
          paymentMethod: "stripe",
          status: "success",
          type: "refund",
          transactionId: refund.id,
          details: { refundId: refund.id },
        }], { session: session || undefined });

        order.paymentStatus = "refunded";
      } else {
        order.paymentStatus = "refund_pending";
      }
    } else {
      // Đối với SePay / Chuyển khoản, không thể auto refund, đánh dấu chờ hoàn tiền thủ công
      order.paymentStatus = "refund_pending";
      
      await (PaymentTransaction as any).create([{
        orderId: order._id,
        amount: transaction.amount,
        paymentMethod: (transaction as any).paymentMethod,
        status: "pending", // Đợi Admin xử lý thủ công
        type: "refund",
        transactionId: `REFUND_${Date.now()}`,
        details: { note: "Yêu cầu hoàn tiền thủ công do khách hàng huỷ đơn." },
      }], { session: session || undefined });
    }
    
    if (!session) {
      await order.save();
    }
  } catch (error: any) {
    console.error(`[Refund] Lỗi khi hoàn tiền đơn ${order.code}:`, error.message);
    order.paymentStatus = "refund_pending";
    if (!session) {
      await order.save();
    }
  }
};
