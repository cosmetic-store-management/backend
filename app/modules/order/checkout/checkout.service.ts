import mongoose from "mongoose";
import Order from "../models/order.schema.js";
import User, { UserDocument } from "../../user/models/user.schema.js";
import Product from "../../product/models/product.schema.js";
import PointHistory from "../../user/models/point-history.schema.js";
import InventoryTransaction from "../../inventory/models/inventory-transaction.schema.js";
import * as inventoryRepo from "../../inventory/inventory.repository.js";
import { mapOrder } from "../dto/order.response.dto.js";
import { badRequest, notFound } from "../../../shared/errors/httpErrors.js";
import { CreateOrderInput } from "../dto/order.request.dto.js";
import {
  validateVoucher,
  incrementVoucherUsage,
} from "../../voucher/voucher.service.js";

import {
  calculateTierDiscount,
  generateOrderCode,
  getOrderSettings,
} from "./checkout.helper.js";
import { calcShippingFeeFromSettings } from "../shipping/shipping.service.js";
import { sendOrderSuccessEmail } from "../../../shared/email/email.service.js";
import * as orderRepo from "../order.repository.js";
import { findActiveFlashSale, incrementFlashSaleSoldQuantity } from "../../marketing/flash-sale.repository.js";

export const getUserTotalSpent = async (
  userId: mongoose.Types.ObjectId | string,
): Promise<number> => {
  const [result] = await Order.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId.toString()),
        orderStatus: "completed",
      },
    },
    { $group: { _id: null, totalSpent: { $sum: "$totalAmount" } } },
  ]);
  return result?.totalSpent ?? 0;
};

export const previewOrder = async (user: UserDocument | null, data: any) => {
  if (data.items && Array.isArray(data.items)) {
    data.items = data.items.reduce((acc: any[], item: any) => {
      const existing = acc.find((i) => i.variantId === item.variantId);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        acc.push({ ...item });
      }
      return acc;
    }, []);
  }

  let subtotal = 0;
  const previewItems: {
    variantId: string;
    productId: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }[] = [];

  const variantIds = Array.from(new Set(data.items.map((i: any) => i.variantId)));
  const [variantsList, activeFlashSale] = await Promise.all([
    orderRepo.findVariantsByIds(variantIds as string[]),
    findActiveFlashSale(),
  ]);
  const variantMap = new Map(variantsList.map(v => [v._id.toString(), v]));

  for (const item of data.items) {
    if (!mongoose.Types.ObjectId.isValid(item.productId))
      throw badRequest("productId không hợp lệ");
    if (!item.variantId || !mongoose.Types.ObjectId.isValid(item.variantId))
      throw badRequest("variantId không hợp lệ");

    const variant = variantMap.get(item.variantId);
    if (!variant || variant.productId.toString() !== item.productId)
      throw notFound("Phân loại hàng không hợp lệ");
    if (!variant.isActive)
      throw badRequest(
        `Phân loại ${variant.name} hiện không khả dụng`,
      );

    let unitPrice =
      variant.discountPrice && variant.discountPrice > 0
        ? variant.discountPrice
        : variant.price;

    if (activeFlashSale) {
      const fsItem = activeFlashSale.items.find((fsItem: any) => fsItem.variantId._id.toString() === item.variantId);
      if (fsItem && fsItem.soldQuantity + item.quantity <= fsItem.quantityLimit) {
        unitPrice = fsItem.flashPrice;
      }
    }

    const lineTotal = unitPrice * item.quantity;
    subtotal += lineTotal;

    // Collect per-item pricing from DB (source of truth, not cart cache)
    previewItems.push({
      variantId: item.variantId,
      productId: item.productId,
      unitPrice,
      quantity: item.quantity,
      lineTotal,
    });
  }

  const totalItems = data.items.reduce(
    (sum: number, item: any) => sum + item.quantity,
    0,
  );
  const shippingFee = await calcShippingFeeFromSettings(
    subtotal,
    totalItems,
    data.province || "",
    data.district || "",
    data.ward || "",
    data.street || "",
    data.channel || "online",
  );

  // Khách hàng cho POS
  let customerUser = user;
  if (data.channel === "pos" && data.customerPhone) {
    customerUser = await User.findOne({
      phone: data.customerPhone.trim(),
      role: "customer",
    });
  }

  // 1. Áp dụng giảm giá Hạng thành viên (dựa trên tổng chi tiêu lịch sử)
  const userTotalSpent =
    customerUser?.role === "customer" && customerUser._id
      ? await getUserTotalSpent(customerUser._id)
      : 0;
  const tierDiscountAmount =
    customerUser?.role === "customer"
      ? calculateTierDiscount(userTotalSpent, subtotal)
      : 0;

  // 2. Áp dụng Voucher (hoặc manual discount ở POS)
  let voucherDiscountAmount = 0;
  let freeshipDiscountAmount = 0;
  let finalVoucherCode = "";
  if (data.channel === "pos" && typeof data.discountAmount === "number") {
    voucherDiscountAmount = data.discountAmount; // POS dùng manual discount
  } else if (data.voucherCode) {
    try {
      const voucherRes = await validateVoucher(
        data.voucherCode,
        subtotal,
        shippingFee,
        user?._id.toString(),
      );
      if (voucherRes.discountType === "freeship") {
        freeshipDiscountAmount = voucherRes.discountAmount;
      } else {
        voucherDiscountAmount = voucherRes.discountAmount;
      }
      finalVoucherCode = voucherRes.voucherCode;
    } catch (error: any) {
      // Bỏ qua lỗi voucher khi preview để không chặn người dùng gõ
    }
  }

  const productDiscount = Math.min(
    tierDiscountAmount + voucherDiscountAmount,
    subtotal,
  );
  const totalDiscount = productDiscount + freeshipDiscountAmount;
  const totalAmountBeforePoints = Math.max(
    0,
    subtotal + shippingFee - totalDiscount,
  );

  // Lấy cài đặt động từ DB
  const orderSettings = await getOrderSettings();

  // 3. Xử lý dùng điểm
  const userPoints = customerUser?.points || 0;
  const requestedUsedPoints =
    typeof data.usedPoints === "number" && data.usedPoints > 0
      ? data.usedPoints
      : 0;
  const maxPointsAllowed = Math.floor(
    totalAmountBeforePoints * orderSettings.maxPointsPct,
  );
  const actualUsedPoints = Math.min(
    requestedUsedPoints,
    userPoints,
    maxPointsAllowed,
  );

  const finalTotalAmount = Math.max(
    0,
    totalAmountBeforePoints - actualUsedPoints,
  );

  return {
    items: previewItems, // <- per-item prices từ DB
    subtotal,
    shippingFee,
    tierDiscountAmount,
    voucherDiscountAmount,
    freeshipDiscountAmount,
    finalVoucherCode,
    totalDiscount,
    userPoints,
    maxPointsAllowed,
    actualUsedPoints,
    finalTotalAmount,
  };
};

export const createOrder = async (
  user: UserDocument,
  data: CreateOrderInput & { idempotencyKey?: string },
) => {
  if (!data.items || data.items.length === 0)
    throw badRequest("Giỏ hàng rỗng");

  data.items = data.items.reduce((acc: any[], item: any) => {
    const existing = acc.find((i) => i.variantId === item.variantId);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      acc.push({ ...item });
    }
    return acc;
  }, []);

  // Ngăn chặn Double Submit (Double Charge) bằng Idempotency Key
  if (data.idempotencyKey) {
    const existingOrder = await Order.findOne({
      idempotencyKey: data.idempotencyKey,
      userId: user._id,
    });
    if (existingOrder) {
      // Đã tạo trước đó ở luồng khác, chỉ trả về lại kết quả cũ (Idempotent response)
      const mapped = mapOrder(
        existingOrder,
        (existingOrder as any).items || [],
      );
      return mapped;
    }
  }

  const receiverName = data.receiverName.trim();
  const phone = data.phone.trim();
  const province = data.province.trim();
  const district = data.district.trim();
  const ward = data.ward.trim();
  const street = data.street.trim();

  const normalizedItems: any[] = [];
  let subtotal = 0;

  const productIds = Array.from(new Set(data.items.map((i: any) => i.productId)));
  const variantIds = Array.from(new Set(data.items.map((i: any) => i.variantId)));

  const [productsList, variantsList, activeFlashSale] = await Promise.all([
    orderRepo.findProductsByIds(productIds as string[]),
    orderRepo.findVariantsByIds(variantIds as string[]),
    findActiveFlashSale(),
  ]);
  const productMap = new Map(productsList.map(p => [p._id.toString(), p]));
  const variantMap = new Map(variantsList.map(v => [v._id.toString(), v]));

  for (const item of data.items) {
    if (!mongoose.Types.ObjectId.isValid(item.productId))
      throw badRequest("productId không hợp lệ");
    if (!item.variantId || !mongoose.Types.ObjectId.isValid(item.variantId))
      throw badRequest("variantId không hợp lệ");

    const product = productMap.get(item.productId);
    if (!product) throw notFound("Có sản phẩm không tồn tại");
    if (!product.isActive)
      throw badRequest(`Sản phẩm ${product.name} hiện không khả dụng`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((product.categoryId as any)?.isActive === false)
      throw badRequest(`Danh mục của sản phẩm ${product.name} hiện không khả dụng`);

    const variant = variantMap.get(item.variantId);
    if (!variant || variant.productId.toString() !== item.productId)
      throw notFound("Phân loại hàng không hợp lệ");
    if (!variant.isActive)
      throw badRequest(`Phân loại ${variant.name} của sản phẩm ${product.name} hiện không khả dụng`);
    if (variant.stock < item.quantity)
      throw badRequest(`Sản phẩm ${product.name} (${variant.name}) không đủ tồn kho`);

    let unitPrice =
      variant.discountPrice && variant.discountPrice > 0
        ? variant.discountPrice
        : variant.price;

    let isFlashSale = false;
    if (activeFlashSale) {
      const fsItem = activeFlashSale.items.find((fsItem: any) => fsItem.variantId._id.toString() === item.variantId);
      if (fsItem) {
        if (fsItem.soldQuantity + item.quantity <= fsItem.quantityLimit) {
          unitPrice = fsItem.flashPrice;
          isFlashSale = true;
        } else {
          // Could throw error or just fallback to normal price. We fallback to normal price as per logic, 
          // but we can throw error to be strict. Let's fallback.
        }
      }
    }

    const lineTotal = unitPrice * item.quantity;
    subtotal += lineTotal;

    normalizedItems.push({
      productId: product._id,
      variantId: variant._id,
      productName: product.name,
      variantName: variant.name,
      imageUrl: variant.imageUrl || product.imageUrl,
      price: unitPrice,
      quantity: item.quantity,
      lineTotal,
    });
  }

  // Tính tổng số lượng sản phẩm
  const totalItems = normalizedItems.reduce(
    (sum, item: any) => sum + item.quantity,
    0,
  );

  // Phí ship — tính bằng thuật toán
  const shippingFee = await calcShippingFeeFromSettings(
    subtotal,
    totalItems,
    province,
    district,
    ward,
    street,
    "online",
  );


  // 1. Áp dụng giảm giá Hạng thành viên (Spending-based)
  const userTotalSpent =
    user.role === "customer" ? await getUserTotalSpent(user._id) : 0;
  const tierDiscountAmount =
    user.role === "customer"
      ? calculateTierDiscount(userTotalSpent, subtotal)
      : 0;

  // 2. Áp dụng Voucher (nếu có)
  let voucherDiscountAmount = 0;
  let freeshipDiscountAmount = 0;
  let finalVoucherCode = "";
  if (data.voucherCode) {
    try {
      const voucherRes = await validateVoucher(
        data.voucherCode,
        subtotal,
        shippingFee,
        user._id.toString(),
      );
      if (voucherRes.discountType === "freeship") {
        freeshipDiscountAmount = voucherRes.discountAmount;
      } else {
        voucherDiscountAmount = voucherRes.discountAmount;
      }
      finalVoucherCode = voucherRes.voucherCode;
    } catch (error: any) {
      throw badRequest(error.message || "Mã giảm giá không hợp lệ");
    }
  }

  const productDiscount = Math.min(
    tierDiscountAmount + voucherDiscountAmount,
    subtotal,
  );
  const totalDiscount = productDiscount + freeshipDiscountAmount;
  const totalAmountBeforePoints = Math.max(
    0,
    subtotal + shippingFee - totalDiscount,
  );

  // Lấy cài đặt động từ DB
  const orderSettings = await getOrderSettings();

  // 3. Xử lý dùng điểm
  const userPoints = user.points || 0;
  const requestedUsedPoints =
    typeof data.usedPoints === "number" && data.usedPoints > 0
      ? data.usedPoints
      : 0;
  const maxPointsAllowed = Math.floor(
    totalAmountBeforePoints * orderSettings.maxPointsPct,
  );
  const actualUsedPoints = Math.min(
    requestedUsedPoints,
    userPoints,
    maxPointsAllowed,
  );

  const finalTotalAmount = Math.max(
    0,
    totalAmountBeforePoints - actualUsedPoints,
  );

  // 4. Bắt đầu Transaction cho Checkout
  const session = await mongoose.startSession();
  session.startTransaction();

  let newOrder;
  let orderItems;

  try {
    // Trừ tồn kho trước (Atomic Increment with conditions within session)
    // Sort array to prevent Deadlock when locking multiple variant documents
    let orderTotalCost = 0;
    const sortedItemsToDeduct = [...normalizedItems].sort((a: any, b: any) => 
       a.variantId.toString().localeCompare(b.variantId.toString())
    );
    for (const item of sortedItemsToDeduct) {
      await orderRepo.decrementVariantStock(
        item.variantId.toString(),
        item.quantity,
        session
      );
      
      const costPriceTotal = await inventoryRepo.deductBatchesFIFO(
        item.variantId,
        item.quantity,
        session
      );
      item.costPriceTotal = costPriceTotal;
      orderTotalCost += costPriceTotal;
    }

    // Tạo đơn hàng
    newOrder = await orderRepo.createOrder({
      code: generateOrderCode(),
      receiverName,
      phone,
      province,
      district,
      ward,
      street,
      orderStatus: "pending",
      paymentMethod: data.paymentMethod,
      subtotal,
      shippingFee,
      voucherCode: finalVoucherCode,
      discountAmount: totalDiscount,
      tierDiscountAmount,
      usedPoints: actualUsedPoints,
      totalAmount: finalTotalAmount,
      totalCost: orderTotalCost,
      note: data.note,
      userId: user._id as any,
      channel: "online",
      creatorId: null,
      paymentStatus: "pending",
      idempotencyKey: data.idempotencyKey,
      items: normalizedItems,
    }, session);

    orderItems = (newOrder as any).items;

    // Tăng lượt sử dụng voucher
    if (finalVoucherCode) {
      await incrementVoucherUsage(finalVoucherCode, user._id.toString(), session);
    }

    // Tăng soldQuantity cho Flash Sale nếu có
    if (activeFlashSale) {
      for (const item of normalizedItems) {
        const fsItem = activeFlashSale.items.find(
          (fsItem: any) => fsItem.variantId._id.toString() === item.variantId
        );
        if (fsItem && fsItem.soldQuantity + item.quantity <= fsItem.quantityLimit) {
          await incrementFlashSaleSoldQuantity(
            activeFlashSale._id.toString(),
            item.variantId,
            item.quantity,
            session
          );
        }
      }
    }

    // Trừ điểm của khách nếu dùng
    if (actualUsedPoints > 0) {
      const updatedUser = await User.findOneAndUpdate(
        { _id: user._id, points: { $gte: actualUsedPoints } },
        { $inc: { points: -actualUsedPoints } },
        { session, returnDocument: "after" },
      );
      if (!updatedUser) {
        throw badRequest(
          "Điểm tích lũy không đủ hoặc đã thay đổi do giao dịch khác. Vui lòng thử lại.",
        );
      }
      // Khởi tạo PointHistory model nếu cần (đã import ở trên)
      await PointHistory.create([{
        userId: user._id,
        pointsChanged: -actualUsedPoints,
        reason: `Sử dụng điểm cho đơn hàng #${newOrder.code}`,
        performedBy: user._id,
      }], { session });
    }

    await session.commitTransaction();
  } catch (error: any) {
    await session.abortTransaction();
    
    // Xử lý E11000 Duplicate Key (Race condition của Idempotency Key)
    if (error.code === 11000 && data.idempotencyKey) {
      const existingOrder = await Order.findOne({
        idempotencyKey: data.idempotencyKey,
        userId: user._id,
      });
      if (existingOrder) {
        return mapOrder(existingOrder, (existingOrder as any).items || []);
      }
    }

    throw badRequest(
      error.message || "Lỗi trong quá trình tạo đơn hàng, vui lòng thử lại."
    );
  } finally {
    await session.endSession();
  }

  // Gửi email bất đồng bộ, không đợi kết quả để tránh block response
  // Chỉ gửi email ngay lập tức cho COD hoặc Cash (chưa thanh toán nhưng đặt thành công)
  // Các phương thức QR/Stripe (cần thanh toán) thì chỉ gửi email sau khi ĐÃ thanh toán xong
  if (user.email && ["cod", "cash"].includes(data.paymentMethod)) {
    sendOrderSuccessEmail(user.email, newOrder.code, finalTotalAmount).catch(
      console.error,
    );
  }

  const mappedOrder = mapOrder(newOrder, orderItems);
  return mappedOrder;
};

// ── Source: order-pos.service.ts ──────────────────────────────────────────────

export const createPOSOrder = async (operator: UserDocument, data: any) => {
  if (data.items && Array.isArray(data.items)) {
    data.items = data.items.reduce((acc: any[], item: any) => {
      const existing = acc.find((i) => i.variantId === item.variantId);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        acc.push({ ...item });
      }
      return acc;
    }, []);
  }

  const customerPhone = data.customerPhone?.trim();
  const customerName = data.customerName?.trim();
  let customerUser = null;

  if (customerPhone) {
    customerUser = await User.findOne({
      phone: customerPhone,
      role: "customer",
    });

    // Implicit Customer Creation
    if (!customerUser) {
      customerUser = await User.create({
        name: customerName || `Khách hàng`,
        phone: customerPhone,
        role: "customer",
        points: 0,
        isActive: true,
      });
    }
  }

  const normalizedItems: any[] = [];
  let subtotal = 0;

  const productIds = Array.from(new Set(data.items.map((i: any) => i.productId)));
  const variantIds = Array.from(new Set(data.items.map((i: any) => i.variantId)));

  const [productsList, variantsList] = await Promise.all([
    orderRepo.findProductsByIds(productIds as string[]),
    orderRepo.findVariantsByIds(variantIds as string[])
  ]);
  const productMap = new Map(productsList.map(p => [p._id.toString(), p]));
  const variantMap = new Map(variantsList.map(v => [v._id.toString(), v]));

  for (const item of data.items) {
    if (!mongoose.Types.ObjectId.isValid(item.productId))
      throw badRequest("productId không hợp lệ");
    if (!item.variantId || !mongoose.Types.ObjectId.isValid(item.variantId))
      throw badRequest("variantId không hợp lệ");

    const product = productMap.get(item.productId);
    if (!product) throw notFound("Có sản phẩm không tồn tại");
    if (!product.isActive)
      throw badRequest(`Sản phẩm ${product.name} hiện không khả dụng`);

    const variant = variantMap.get(item.variantId);
    if (!variant || variant.productId.toString() !== item.productId)
      throw notFound("Phân loại hàng không hợp lệ");
    if (!variant.isActive)
      throw badRequest(`Phân loại ${variant.name} của sản phẩm ${product.name} hiện không khả dụng`);
    if (variant.stock < item.quantity)
      throw badRequest(`Sản phẩm ${product.name} (${variant.name}) không đủ tồn kho`);

    const unitPrice =
      variant.discountPrice && variant.discountPrice > 0
        ? variant.discountPrice
        : variant.price;
    const lineTotal = unitPrice * item.quantity;
    subtotal += lineTotal;

    normalizedItems.push({
      productId: product._id,
      variantId: variant._id,
      productName: product.name,
      variantName: variant.name,
      imageUrl: variant.imageUrl || product.imageUrl,
      price: unitPrice,
      quantity: item.quantity,
      lineTotal,
    });
  }

  let userPoints = 0;
  let tierDiscountAmount = 0;
  if (customerUser) {
    userPoints = customerUser.points || 0;
    const customerTotalSpent = await getUserTotalSpent(
      customerUser._id.toString(),
    );
    tierDiscountAmount = calculateTierDiscount(customerTotalSpent, subtotal);
  }

  const orderCode = `POS-${generateOrderCode().replace("GLU-", "")}`;

  const providedDiscount =
    typeof data.discountAmount === "number" && data.discountAmount > 0
      ? data.discountAmount
      : 0;
  // Tổng giảm giá (Discount tay ở POS + Chiết khấu Hạng)
  const totalDiscountAmount = Math.min(
    providedDiscount + tierDiscountAmount,
    subtotal,
  );

  const totalAmountBeforePoints = Math.max(0, subtotal - totalDiscountAmount);

  // Lấy cài đặt động từ DB
  const orderSettings = await getOrderSettings();

  // Xử lý dùng điểm
  const requestedUsedPoints =
    typeof data.usedPoints === "number" && data.usedPoints > 0
      ? data.usedPoints
      : 0;
  const maxPointsAllowed = Math.floor(
    totalAmountBeforePoints * orderSettings.maxPointsPct,
  );
  const actualUsedPoints = customerUser
    ? Math.min(requestedUsedPoints, userPoints, maxPointsAllowed)
    : 0;

  const finalTotalAmount = Math.max(
    0,
    totalAmountBeforePoints - actualUsedPoints,
  );

  // 4. Bắt đầu Transaction cho POS Checkout
  const session = await mongoose.startSession();
  session.startTransaction();

  let newOrder;
  let orderItems;

  try {
    // Trừ tồn kho trước (Atomic Increment with conditions within session)
    // Sort array to prevent Deadlock when locking multiple variant documents
    let orderTotalCost = 0;
    const sortedItemsToDeduct = [...normalizedItems].sort((a: any, b: any) => 
       a.variantId.toString().localeCompare(b.variantId.toString())
    );
    for (const item of sortedItemsToDeduct) {
      await orderRepo.decrementVariantStock(
        item.variantId.toString(),
        item.quantity,
        session
      );

      const costPriceTotal = await inventoryRepo.deductBatchesFIFO(
        item.variantId,
        item.quantity,
        session
      );
      item.costPriceTotal = costPriceTotal;
      orderTotalCost += costPriceTotal;
    }

    // Tạo đơn hàng
    newOrder = await orderRepo.createOrder({
      code: orderCode,
      receiverName: customerUser ? customerUser.name : "Khách lẻ tại quầy",
      phone: customerUser ? customerUser.phone : "0000000000",
      province: "N/A",
      district: "N/A",
      ward: "N/A",
      street: "Bán tại quầy",
      orderStatus: "completed",
      paymentMethod: data.paymentMethod,
      subtotal,
      shippingFee: 0,
      voucherCode: "",
      discountAmount: totalDiscountAmount,
      tierDiscountAmount,
      usedPoints: actualUsedPoints,
      totalAmount: finalTotalAmount,
      totalCost: orderTotalCost,
      note: data.note || (totalDiscountAmount > 0 ? `Giảm giá tại quầy: ${totalDiscountAmount.toLocaleString("vi-VN")}₫` : ""),
      userId: customerUser ? (customerUser._id as any) : null,
      channel: "pos",
      creatorId: operator._id as any,
      paymentStatus: "paid",
      earnedPoints: Math.floor(finalTotalAmount / orderSettings.pointsEarnRate),
      items: normalizedItems,
    }, session);

    orderItems = (newOrder as any).items;

    if (customerUser) {
      const pointsEarned = Math.floor(finalTotalAmount / orderSettings.pointsEarnRate);
      const netPoints = pointsEarned - actualUsedPoints;

      // Cập nhật điểm Atomic
      const updateQuery: any = { _id: customerUser._id };
      if (netPoints < 0) {
        updateQuery.points = { $gte: Math.abs(netPoints) };
      }

      const updatedUser = await User.findOneAndUpdate(
        updateQuery,
        { $inc: { points: netPoints } },
        { session, returnDocument: "after" }
      );

      if (!updatedUser) {
        throw badRequest("Điểm tích lũy của khách hàng không đủ hoặc đã thay đổi.");
      }

      if (actualUsedPoints > 0) {
        await PointHistory.create([{
          userId: customerUser._id,
          pointsChanged: -actualUsedPoints,
          reason: `Sử dụng điểm thanh toán đơn POS #${newOrder.code}`,
          performedBy: operator._id,
        }], { session });
      }

      if (pointsEarned > 0) {
        await PointHistory.create([{
          userId: customerUser._id,
          pointsChanged: pointsEarned,
          reason: `Hoàn thành đơn hàng POS #${newOrder.code} (Tích luỹ)`,
          performedBy: operator._id,
        }], { session });
      }
    }

    // Log inventory transactions & Increment soldCount
    // Sort by productId to prevent deadlocks
    const sortedProductsToLog = [...normalizedItems].sort((a: any, b: any) => 
       a.productId.toString().localeCompare(b.productId.toString())
    );
    for (const item of sortedProductsToLog) {
      await InventoryTransaction.create([{
        code: `TX-POS-${Math.floor(100000 + Math.random() * 900000)}`,
        productId: item.productId,
        variantId: item.variantId,
        type: "out",
        qty: item.quantity,
        creatorId: operator._id,
        date: new Date(),
      }], { session });

      await Product.findByIdAndUpdate(item.productId, {
        $inc: { soldCount: item.quantity },
      }, { session });
    }

    await session.commitTransaction();
  } catch (error: any) {
    await session.abortTransaction();
    throw badRequest(error.message || "Lỗi trong quá trình tạo đơn POS, vui lòng thử lại.");
  } finally {
    await session.endSession();
  }

  return mapOrder(newOrder, orderItems);
};
