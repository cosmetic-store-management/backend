import Order, { OrderDocument } from "../../models/order.schema.js";
import User, { UserDocument } from "../../models/user.schema.js";
import PointHistory from "../../models/point-history.schema.js";
import { mapOrder } from "./dto/order.response.dto.js";
import { notFound, forbidden, badRequest } from "../../shared/errors/httpErrors.js";
import * as orderRepo from "./order.repository.js";

import crypto from "crypto";
import qs from "qs";
import moment from "moment";

export const createVnpayUrl = async (orderId: string, requestUser: UserDocument, ipAddr: string) => {
  const order = await orderRepo.findOrderById(orderId);
  if (!order) throw notFound("Không tìm thấy đơn hàng");

  if (String(order.userId) !== String(requestUser._id)) {
    throw forbidden("Bạn không có quyền thao tác đơn hàng này");
  }

  if (order.paymentStatus === "paid") {
    throw badRequest("Đơn hàng đã được thanh toán");
  }

  const tmnCode = process.env.VNP_TMN_CODE || "your_tmn_code_here";
  const secretKey = process.env.VNP_HASH_SECRET || "your_hash_secret_here";
  let vnpUrl = process.env.VNP_URL || "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
  const returnUrl = process.env.VNP_RETURN_URL || "http://localhost:5173/checkout/vnpay_return";

  const createDate = moment(new Date()).format("YYYYMMDDHHmmss");
  const expireDate = moment(new Date()).add(15, 'minutes').format("YYYYMMDDHHmmss");
  
  const amount = order.totalAmount;
  const bankCode = "";

  const vnp_Params: any = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: tmnCode,
    vnp_Locale: "vn",
    vnp_CurrCode: "VND",
    vnp_TxnRef: order.code, // Mã đơn hàng dùng làm Ref
    vnp_OrderInfo: `Thanh toan don hang ${order.code}`,
    vnp_OrderType: "other",
    vnp_Amount: amount * 100, // VNPay tính bằng HÀO
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: ipAddr,
    vnp_CreateDate: createDate,
    vnp_ExpireDate: expireDate
  };

  if (bankCode) {
    vnp_Params.vnp_BankCode = bankCode;
  }

  // Sắp xếp tham số theo chuẩn VNPay (Alphabel)
  const sortedParams = sortObject(vnp_Params);

  const signData = qs.stringify(sortedParams, { encode: false });
  const hmac = crypto.createHmac("sha512", secretKey);
  const signed = hmac.update(new Buffer(signData, "utf-8")).digest("hex"); 
  sortedParams.vnp_SecureHash = signed;

  vnpUrl += "?" + qs.stringify(sortedParams, { encode: false });

  // Return url payment thay vì mockPayment
  return { paymentUrl: vnpUrl };
};

// Helper sort object cho vnpay
function sortObject(obj: any) {
  const sorted: any = {};
  const str = [];
  let key;
  for (key in obj) {
    if (obj.hasOwnProperty(key)) {
      str.push(encodeURIComponent(key));
    }
  }
  str.sort();
  for (key = 0; key < str.length; key++) {
    sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, "+");
  }
  return sorted;
}

export const handleVnpayIpn = async (query: any) => {
  const vnp_SecureHash = query.vnp_SecureHash;
  delete query.vnp_SecureHash;
  delete query.vnp_SecureHashType;

  const secretKey = process.env.VNP_HASH_SECRET || "your_hash_secret_here";
  const sortedParams = sortObject(query);
  const signData = qs.stringify(sortedParams, { encode: false });
  const hmac = crypto.createHmac("sha512", secretKey);
  const signed = hmac.update(new Buffer(signData, "utf-8")).digest("hex"); 

  if (vnp_SecureHash !== signed) {
    return { RspCode: "97", Message: "Invalid signature" };
  }

  const orderCode = query.vnp_TxnRef;
  const responseCode = query.vnp_ResponseCode;

  const order = await orderRepo.findOrderByCode(orderCode);
  if (!order) return { RspCode: "01", Message: "Order not found" };

  if (order.totalAmount * 100 !== Number(query.vnp_Amount)) return { RspCode: "04", Message: "Invalid amount" };
  
  const targetStatus = responseCode === "00" ? "paid" : "failed";

  // Sử dụng Atomic Update để ngăn chặn Webhook Dội Bom (Race Condition Idempotency)
  const updatedOrder = await Order.findOneAndUpdate(
    { _id: order._id, paymentStatus: "pending" },
    { $set: { paymentStatus: targetStatus } },
    { returnDocument: "after" }
  );

  if (!updatedOrder) {
    return { RspCode: "02", Message: "Order already confirmed" };
  }

  // Nếu thanh toán online thành công, cộng điểm tích luỹ cho khách hàng
  const earnedPoints = updatedOrder.earnedPoints || 0;
  if (targetStatus === "paid" && earnedPoints > 0 && updatedOrder.userId) {
    await User.findByIdAndUpdate(updatedOrder.userId, {
      $inc: { points: earnedPoints }
    });
    
    await PointHistory.create({
      userId: updatedOrder.userId,
      pointsChanged: earnedPoints,
      reason: `Thanh toán online thành công đơn hàng #${updatedOrder.code} (Tích luỹ)`,
      performedBy: updatedOrder.userId,
    });
  }

  return { RspCode: "00", Message: "Confirm Success" };
};
