import Stripe from "stripe";
import crypto from "crypto";
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
    throw badRequest("The order is not in pending payment status");
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
        throw badRequest("Missing STRIPE_WEBHOOK_SECRET in the production environment");
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
          // Only fetch and update if the order is still pending
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
            console.log(`[Stripe Webhook] Order ${order.code} has been paid.`);

            // Gửi email xác nhận thanh toán thành công
            const emailUser = await User.findById(order.userId).select("email");
            if (emailUser && emailUser.email) {
              sendOrderSuccessEmail(emailUser.email, order.code, order.totalAmount).catch(console.error);
            }
          } else {
            // The order does not exist or is not pending (it may already have been handled by the cancellation cron)
            const existingOrder = await Order.findById(orderId);
            if (existingOrder && existingOrder.orderStatus !== "pending" && existingOrder.paymentStatus !== "paid") {
              // Payment succeeded but the order was cancelled -> move it to refund flow
              existingOrder.paymentStatus = "refund_pending";
              await existingOrder.save({ session });
              
              await (PaymentTransaction as any).create([{
                orderId: existingOrder._id,
                amount: paymentIntent.amount,
                method: "stripe",
                status: "success", // Funds have been received
                type: "charge",
                transactionId: paymentIntent.id,
                details: {
                  paymentIntentId: paymentIntent.id,
                  note: `Customer paid successfully but the order is currently in ${existingOrder.orderStatus} status. Refund required.`
                },
              }], { session });
            }
            await session.commitTransaction();
          }
        } catch (error) {
          await session.abortTransaction();
          console.error("Error while processing the Stripe webhook succeeded event:", error);
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

  // --- SEPAY WEBHOOK (AUTO-CONFIRM BANK TRANSFER) ---
import Setting from "../../setting/models/setting.schema.js";

export const handleSepayWebhook = async (payload: any, authHeader: string) => {
  // 1. Check the security token to ensure the request comes from SePay
  const webhookSetting = await Setting.findOne({ key: "global_settings" });
  const configuredToken = webhookSetting?.value?.sepayWebhookToken;
  
  if (!configuredToken) {
    throw badRequest("The system has not configured a security token for SePay");
  }

  // SePay gửi API Key dạng "Apikey [TOKEN]" trong header Authorization
  const requestToken = authHeader?.replace("Apikey ", "")?.trim();
  if (requestToken !== configuredToken) {
    throw badRequest("Invalid webhook token");
  }

  const { content, transferAmount } = payload;
  if (!content || !transferAmount) {
    throw badRequest("Payload is missing content or transferAmount");
  }

  // 2. Parse the content to find the order code.
  // The default VietQR syntax we generate is: GLOWUP [Order Code]
  const match = content.match(/GLOWUP\s+([A-Z0-9]+)/i);
  if (!match) {
    // No valid order code was found in the transfer content
    console.log(`[SePay Webhook] Skipping transaction: order code does not match - "${content}"`);
    return true; // Return true so SePay does not resend the webhook
  }

  const orderCode = match[1].toUpperCase();

  // 3. Update the order
  const order = await Order.findOne({ code: orderCode });
  if (!order) {
    console.log(`[SePay Webhook] Order code ${orderCode} was not found in the system.`);
    return true; 
  }

  if (order.orderStatus !== "pending") {
    console.log(`[SePay Webhook] Order ${orderCode} is not in pending payment status (current: ${order.orderStatus}). Admin manual review is required.`);
    
    // If the order was cancelled but the customer still transferred money, record it in PaymentTransaction for review
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
          status: "success", // Funds have been received
          type: "charge",
          transactionId: payload.referenceCode || payload.id || `SEPAY_${Date.now()}`,
          details: { rawPayload: payload, note: `Customer transferred late while the order was in ${order.orderStatus} status. Refund required.` },
        }], { session });
        await session.commitTransaction();
      } catch (error) {
        await session.abortTransaction();
        console.error("[SePay Webhook] Error while saving late transaction log:", error);
      } finally {
        await session.endSession();
      }
    }
    return true;
  }

  if (order.paymentStatus === "paid") {
    return true;
  }

  // If the transfer amount is greater than or equal to the amount due
  if (Number(transferAmount) >= order.totalAmount) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      // Use findOneAndUpdate to lock and avoid race conditions if SePay sends two webhooks at once
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
        console.log(`[SePay Webhook] Payment confirmed successfully for order ${orderCode}!`);

        if (order.userId) {
          User.findById(order.userId)
            .select("email")
            .lean()
            .then(u => {
              if (u && u.email) {
                sendOrderSuccessEmail(u.email, updatedOrder.code, updatedOrder.totalAmount)
                  .catch(err => console.error("Error sending order success email:", err));
              }
            });
        }
      } else {
        await session.commitTransaction(); // It may already have been updated
      }
    } catch (error) {
      await session.abortTransaction();
      console.error("[SePay Webhook] Error while updating the order:", error);
      throw error;
    } finally {
      await session.endSession();
    }
  } else {
    console.log(`[SePay Webhook] Transfer amount (${transferAmount}) is lower than the order total (${order.totalAmount}). Admin manual review is required.`);
    // Record the underpayment transaction in the DB for admin review
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
        details: { rawPayload: payload, note: `Underpaid transfer: sent ${transferAmount}, required ${order.totalAmount}` },
      }], { session });
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      console.error("[SePay Webhook] Error while saving underpayment transaction log:", error);
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
      throw new Error("The free VietQR API plan no longer supports lookup. Please upgrade your Casso/VietQR account.");
    }
    throw new Error(data.desc || "Account information not found");
  } catch (error: any) {
    throw badRequest(error.message || "Error while looking up account information");
  }
};

// --- REFUND PAYMENT ---
export const refundPayment = async (orderId: string, session?: mongoose.ClientSession) => {
  const order = await Order.findById(orderId).session(session || null);
  if (!order) throw notFound("Order not found");

  if (order.paymentStatus !== "paid") {
    return; // No refund is needed if payment has not succeeded
  }

  // Tìm giao dịch thanh toán thành công gần nhất
  const transaction = await PaymentTransaction.findOne({
    orderId: order._id,
    status: "success",
    type: "charge",
  }).session(session || null).sort({ createdAt: -1 });

  if (!transaction) {
    console.log(`[Refund] No original payment transaction was found for order ${order.code}. Marking for manual handling.`);
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
      // For SePay / bank transfers, auto refund is not possible, so mark it for manual refund
      order.paymentStatus = "refund_pending";
      
      await (PaymentTransaction as any).create([{
        orderId: order._id,
        amount: transaction.amount,
        paymentMethod: (transaction as any).paymentMethod,
        status: "pending", // Awaiting manual admin processing
        type: "refund",
        transactionId: `REFUND_${Date.now()}`,
        details: { note: "Manual refund requested because the customer cancelled the order." },
      }], { session: session || undefined });
    }
    
    if (!session) {
      await order.save();
    }
  } catch (error: any) {
    console.error(`[Refund] Error while refunding order ${order.code}:`, error.message);
    order.paymentStatus = "refund_pending";
    if (!session) {
      await order.save();
    }
  }
};

export const handlePayosWebhook = async (payload: any, signatureHeader: string) => {
  const { code, desc, data, signature } = payload;
  
  if (!data) {
    throw badRequest("PayOS Payload is missing data");
  }

  // 1. Check signature if Checksum Key is configured
  const webhookSetting = await Setting.findOne({ key: "global_settings" });
  const checksumKey = process.env.PAYOS_CHECKSUM_KEY || webhookSetting?.value?.payosChecksumKey;

  if (checksumKey) {
    // Sort keys alphabetically
    const sortedKeys = Object.keys(data).sort();
    const queryParts = sortedKeys.map(key => {
      let value = data[key];
      if (value === null || value === undefined) {
        value = "";
      }
      return `${key}=${value}`;
    });
    const queryString = queryParts.join("&");
    const computedSignature = crypto
      .createHmac("sha256", checksumKey)
      .update(queryString)
      .digest("hex");

    if (computedSignature !== signature && computedSignature !== signatureHeader) {
      throw badRequest("Invalid PayOS signature");
    }
  } else {
    console.warn("⚠️ PayOS Checksum Key is not configured — signature verification skipped.");
  }

  if (code !== "00" && desc !== "success") {
    console.log(`[PayOS Webhook] Payment failed or pending: code = ${code}, desc = ${desc}`);
    return true;
  }

  // 2. Parse the description to find the order code
  const description = data.description || "";
  const match = description.match(/(ONL|OFF)\d+/i);
  let orderCode = "";

  if (match) {
    orderCode = match[0].toUpperCase();
  } else if (data.orderCode) {
    orderCode = String(data.orderCode);
  }

  if (!orderCode) {
    console.log(`[PayOS Webhook] Skipping: could not extract order code from description "${description}" or data "${data.orderCode}"`);
    return true;
  }

  // 3. Update the order
  const order = await Order.findOne({
    $or: [
      { code: orderCode },
      { code: new RegExp(orderCode, "i") }
    ]
  });

  if (!order) {
    console.log(`[PayOS Webhook] Order code ${orderCode} was not found in the system.`);
    return true;
  }

  if (order.orderStatus !== "pending") {
    console.log(`[PayOS Webhook] Order ${order.code} is not in pending status (current: ${order.orderStatus}).`);
    return true;
  }

  if (order.paymentStatus === "paid") {
    return true;
  }

  const transferAmount = data.amount || 0;
  if (Number(transferAmount) >= order.totalAmount) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
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
        await (PaymentTransaction as any).create([{
          orderId: order._id,
          amount: Number(transferAmount),
          method: "transfer",
          status: "success",
          type: "charge",
          transactionId: data.reference || `PAYOS_${Date.now()}`,
          details: { rawPayload: payload },
        }], { session });

        await session.commitTransaction();
        console.log(`[PayOS Webhook] Payment confirmed successfully for order ${order.code}!`);

        if (order.userId) {
          User.findById(order.userId)
            .select("email")
            .lean()
            .then(u => {
              if (u && u.email) {
                sendOrderSuccessEmail(u.email, updatedOrder.code, updatedOrder.totalAmount)
                  .catch(err => console.error("Error sending order success email:", err));
              }
            });
        }
      } else {
        await session.commitTransaction();
      }
    } catch (error) {
      await session.abortTransaction();
      console.error("[PayOS Webhook] Error while updating order status:", error);
      throw error;
    } finally {
      await session.endSession();
    }
  } else {
    console.log(`[PayOS Webhook] Received amount (${transferAmount}) is lower than order total (${order.totalAmount}). Manual audit required.`);
  }

  return true;
};
