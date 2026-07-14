import { injectable, inject } from "tsyringe";
import { OrderRepository } from "../order.repository.js";
import { InventoryRepository } from "../../../catalog/inventory/inventory.repository.js";
import { VoucherService } from "../../voucher/voucher.service.js";
import { FlashSaleRepository } from "../../../engagement/marketing/flash-sale.repository.js";
import mongoose from "mongoose";
import { CartRepository } from "../../cart/cart.repository.js";
import { UserService } from "../../../identity/user/user.service.js";
import { InventoryService } from "../../../catalog/inventory/inventory.service.js";
import { eventBus } from "../../../shared/event-bus/index.js";
import { mapOrder } from "../dto/order.response.dto.js";
import { badRequest, notFound } from "../../../../shared/errors/httpErrors.js";
import { CreateOrderInput } from "../dto/order.request.dto.js";


import {
  calculateTierDiscount,
  generateOrderCode,
  getOrderSettings,
} from "./checkout.helper.js";
import { OrderActivityService } from "../order-activity.service.js";
import { calcShippingFeeFromSettings } from "../shipping/shipping.service.js";
import { sendOrderSuccessEmail } from "../../../../shared/email/email.service.js";



const paymentMethodLabel: Record<string, string> = {
  cod: "Cash on Delivery",
  bank: "Bank Transfer",
  ewallet: "E-Wallet",
  qr: "QR Code",
  cash: "Cash",
  card: "Card",
  stripe: "Stripe Payment Gateway",
  pos_card: "POS Card Reader",
  transfer: "QR Transfer",
};

@injectable()
export class CheckoutService {
  constructor(
    @inject(OrderRepository) private readonly orderRepo: OrderRepository,
    @inject(InventoryRepository) private readonly inventoryRepo: InventoryRepository,
    @inject(VoucherService) private readonly voucherService: VoucherService,
    @inject(FlashSaleRepository) private readonly flashSaleRepo: FlashSaleRepository,
    @inject(UserService) private readonly userService: UserService,
    @inject(InventoryService) private readonly inventoryService: InventoryService,
    @inject(CartRepository) private readonly cartRepo: CartRepository,
    @inject(OrderActivityService) private readonly orderActivityService: OrderActivityService
  ) {}

  private async getUserTotalSpent(userId: string | mongoose.Types.ObjectId): Promise<number> {
    return this.orderRepo.aggregateUserTotalSpent(userId);
  }

  previewOrder = async (user: any | null, data: any) => {
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
    this.orderRepo.findVariantsByIds(variantIds as string[]),
    this.flashSaleRepo.findActiveFlashSale(),
  ]);
  const variantMap = new Map(variantsList.map(v => [v._id.toString(), v]));

  for (const item of data.items) {
    if (!mongoose.Types.ObjectId.isValid(item.productId))
      throw badRequest("Invalid productId");
    if (!item.variantId || !mongoose.Types.ObjectId.isValid(item.variantId))
      throw badRequest("Invalid variantId");

    const variant = variantMap.get(item.variantId);
    if (!variant || variant.productId.toString() !== item.productId)
      throw notFound("Invalid product variant");
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
      if (fsItem) {
        if (fsItem.soldQuantity + item.quantity <= fsItem.quantityLimit) {
          unitPrice = fsItem.flashPrice;
        } else {
          throw badRequest(`Sản phẩm Flash Sale đã vượt quá lượt mua cho phép (còn lại: ${Math.max(0, fsItem.quantityLimit - fsItem.soldQuantity)}), vui lòng giảm số lượng.`);
        }
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
    const foundUser = await this.userService.getUserByPhone(data.customerPhone.trim());
    if (foundUser && foundUser.role === "customer") {
      customerUser = foundUser;
    }
  }

  // 1. Áp dụng giảm giá Hạng thành viên (dựa trên tổng chi tiêu lịch sử)
  const userTotalSpent =
    customerUser?.role === "customer" && customerUser._id
      ? await this.getUserTotalSpent(customerUser._id)
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
      const voucherRes = await this.voucherService.validateVoucher(
        data.voucherCode,
        subtotal,
        shippingFee,
        user?._id.toString(),
        data.channel || "online",
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

  createOrder = async (
  user: any,
  data: any,
) => {
  if (!data.items || data.items.length === 0)
    throw badRequest("Cart is empty");

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
    const existingOrder = await this.orderRepo.findOne({
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
    this.orderRepo.findProductsByIds(productIds as string[]),
    this.orderRepo.findVariantsByIds(variantIds as string[]),
    this.flashSaleRepo.findActiveFlashSale(),
  ]);
  const productMap = new Map(productsList.map(p => [p._id.toString(), p]));
  const variantMap = new Map(variantsList.map(v => [v._id.toString(), v]));

  for (const item of data.items) {
    if (!mongoose.Types.ObjectId.isValid(item.productId))
      throw badRequest("Invalid productId");
    if (!item.variantId || !mongoose.Types.ObjectId.isValid(item.variantId))
      throw badRequest("Invalid variantId");

    const product = productMap.get(item.productId);
    if (!product) throw notFound("Some products do not exist");
    if (!product.isActive)
      throw badRequest(`Product ${product.name} is currently unavailable`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((product.categoryId as any)?.isActive === false)
      throw badRequest(`Danh mục của sản phẩm ${product.name} hiện không khả dụng`);

    const variant = variantMap.get(item.variantId);
    if (!variant || variant.productId.toString() !== item.productId)
      throw notFound("Invalid product variant");
    if (!variant.isActive)
      throw badRequest(`Variant ${variant.name} of product ${product.name} is currently unavailable`);
    if (variant.stock < item.quantity)
      throw badRequest(`Product ${product.name} (${variant.name}) has insufficient stock`);

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
          throw badRequest(`Sản phẩm Flash Sale đã vượt quá lượt mua cho phép (còn lại: ${Math.max(0, fsItem.quantityLimit - fsItem.soldQuantity)}), vui lòng tải lại trang và giảm số lượng.`);
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
      barcode: variant.barcode || "",
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
    user.role === "customer" ? await this.orderRepo.aggregateUserTotalSpent(user._id.toString()) : 0;
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
      const voucherRes = await this.voucherService.validateVoucher(
        data.voucherCode,
        subtotal,
        shippingFee,
        user._id.toString(),
        "online",
      );
      if (voucherRes.discountType === "freeship") {
        freeshipDiscountAmount = voucherRes.discountAmount;
      } else {
        voucherDiscountAmount = voucherRes.discountAmount;
      }
      finalVoucherCode = voucherRes.voucherCode;
    } catch (error: any) {
      throw badRequest(error.message || "Invalid discount code");
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
      await this.orderRepo.decrementVariantStock(
        item.variantId.toString(),
        item.quantity,
        session
      );

      const costPriceTotal = await this.inventoryService.deductBatchesFIFO(
        item.variantId,
        item.quantity,
        session
      );
      item.costPriceTotal = costPriceTotal;
      orderTotalCost += costPriceTotal;

      await eventBus.emitAsync("inventory.stock.deducted", {
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        price: item.price,
        operatorId: user._id,
        session,
      });
    }

    // Tạo đơn hàng
    newOrder = await this.orderRepo.createOrder({
      code: generateOrderCode("ORD"),
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

    await this.orderActivityService.logOrderActivity(
      newOrder._id,
      "placed",
      {
        note: "Online order placed successfully",
        operatorId: user._id,
        operatorName: user.name,
      },
      session
    );

    orderItems = (newOrder as any).items;

    // Tăng lượt sử dụng voucher
    if (finalVoucherCode) {
      await this.voucherService.incrementVoucherUsage(finalVoucherCode, user._id.toString(), session);
    }

    // Tăng soldQuantity cho Flash Sale nếu có
    if (activeFlashSale) {
      for (const item of normalizedItems) {
        const fsItem = activeFlashSale.items.find(
          (fsItem: any) => fsItem.variantId._id.toString() === item.variantId
        );
        if (fsItem && fsItem.soldQuantity + item.quantity <= fsItem.quantityLimit) {
          await this.flashSaleRepo.incrementFlashSaleSoldQuantity(
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
      await eventBus.emitAsync("user.points.deducted", {
        userId: user._id,
        points: actualUsedPoints,
        orderId: newOrder._id,
        session
      });
    }

    // Clear cart within the session (ECOM-04)
    await this.cartRepo.clearCart(user._id.toString());

    await session.commitTransaction();
  } catch (error: any) {
    await session.abortTransaction();

    // Xử lý E11000 Duplicate Key (Race condition của Idempotency Key)
    if (error.code === 11000 && data.idempotencyKey) {
      const existingOrder = await this.orderRepo.findOne({
        idempotencyKey: data.idempotencyKey,
        userId: user._id,
      });
      if (existingOrder) {
        return mapOrder(existingOrder, (existingOrder as any).items || []);
      }
    }

    throw badRequest(
      error.message || "Error creating order, please try again."
    );
  } finally {
    await session.endSession();
  }

  if (user.email && ["cod", "cash"].includes(data.paymentMethod)) {
    sendOrderSuccessEmail(user.email, newOrder.code, finalTotalAmount).catch(
      console.error,
    );
  }

  const mappedOrder = mapOrder(newOrder, orderItems);
  return mappedOrder;
};

  createPOSOrder = async (operator: any, data: any) => {
  // Generate POS Receipt Number
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, ""); // e.g., 20260708
  const startOfDay = new Date(new Date().setHours(0, 0, 0, 0));
  const endOfDay = new Date(new Date().setHours(23, 59, 59, 999));
  const countToday = await this.orderRepo.countOrdersToday(startOfDay, endOfDay);
  const receiptNumber = `HD-POS-${dateStr}-${String(countToday + 1).padStart(4, "0")}`;

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
    customerUser = await this.userService.getOrCreateGuestUser(
      customerPhone,
      customerName || "Customer",
      undefined,
      "customer"
    );
  }

  const normalizedItems: any[] = [];
  let subtotal = 0;

  const productIds = Array.from(new Set(data.items.map((i: any) => i.productId)));
  const variantIds = Array.from(new Set(data.items.map((i: any) => i.variantId)));

  const [productsList, variantsList] = await Promise.all([
    this.orderRepo.findProductsByIds(productIds as string[]),
    this.orderRepo.findVariantsByIds(variantIds as string[])
  ]);
  const productMap = new Map(productsList.map(p => [p._id.toString(), p]));
  const variantMap = new Map(variantsList.map(v => [v._id.toString(), v]));

  for (const item of data.items) {
    if (!mongoose.Types.ObjectId.isValid(item.productId))
      throw badRequest("Invalid productId");
    if (!item.variantId || !mongoose.Types.ObjectId.isValid(item.variantId))
      throw badRequest("Invalid variantId");

    const product = productMap.get(item.productId);
    if (!product) throw notFound("Some products do not exist");
    if (!product.isActive)
      throw badRequest(`Product ${product.name} is currently unavailable`);

    const variant = variantMap.get(item.variantId);
    if (!variant || variant.productId.toString() !== item.productId)
      throw notFound("Invalid product variant");
    if (!variant.isActive)
      throw badRequest(`Variant ${variant.name} of product ${product.name} is currently unavailable`);
    if (variant.stock < item.quantity)
      throw badRequest(`Product ${product.name} (${variant.name}) has insufficient stock`);

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
      barcode: variant.barcode || "",
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
    const customerTotalSpent = await this.getUserTotalSpent(
      customerUser._id.toString(),
    );
    tierDiscountAmount = calculateTierDiscount(customerTotalSpent, subtotal);
  }

  const orderCode = generateOrderCode("ORD");

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
      await this.orderRepo.decrementVariantStock(
        item.variantId.toString(),
        item.quantity,
        session
      );

      const costPriceTotal = await this.inventoryService.deductBatchesFIFO(
        item.variantId,
        item.quantity,
        session
      );
      item.costPriceTotal = costPriceTotal;
      orderTotalCost += costPriceTotal;
    }

    // Tạo đơn hàng
    newOrder = await this.orderRepo.createOrder({
      code: orderCode,
      receiverName: customerUser ? customerUser.name : "Walk-in customer",
      phone: customerUser ? customerUser.phone : "0000000000",
      province: "N/A",
      district: "N/A",
      ward: "N/A",
      street: "Sell at counter",
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
      receiptNumber,
      paymentStatus: "paid",
      completedAt: new Date(),
      earnedPoints: Math.floor(finalTotalAmount / orderSettings.pointsEarnRate),
      items: normalizedItems,
    }, session);

    await this.orderActivityService.logOrderActivity(
      newOrder._id,
      "placed",
      {
        note: `POS order created successfully at Counter with Receipt number ${newOrder.receiptNumber || newOrder.code}`,
        operatorId: operator._id,
        operatorName: operator.name,
      },
      session
    );

    await this.orderActivityService.logOrderActivity(
      newOrder._id,
      "payment_received",
      {
        note: `Payment of ${finalTotalAmount.toLocaleString("vi-VN")} VND successfully received via ${paymentMethodLabel[data.paymentMethod] || data.paymentMethod}`,
        operatorId: operator._id,
        operatorName: operator.name,
      },
      session
    );

    orderItems = (newOrder as any).items;

    if (customerUser) {
      const pointsEarned = Math.floor(finalTotalAmount / orderSettings.pointsEarnRate);

      if (actualUsedPoints > 0) {
        await eventBus.emitAsync("user.points.deducted", {
          userId: customerUser._id,
          points: actualUsedPoints,
          orderId: newOrder._id,
          session
        });
      }

      if (pointsEarned > 0) {
        await eventBus.emitAsync("user.points.added", {
          userId: customerUser._id,
          points: pointsEarned,
          orderId: newOrder._id,
          session
        });
      }
    }

    // Log inventory transactions & Increment soldCount
    // Sort by productId to prevent deadlocks
    const sortedProductsToLog = [...normalizedItems].sort((a: any, b: any) =>
      a.productId.toString().localeCompare(b.productId.toString())
    );
    for (const item of sortedProductsToLog) {
      await eventBus.emitAsync("inventory.stock.deducted", {
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        price: item.price,
        operatorId: operator._id,
        session,
      });

      await this.orderRepo.incrementProductSoldCount(item.productId.toString(), item.quantity, session);
    }

    await session.commitTransaction();
  } catch (error: any) {
    await session.abortTransaction();
    throw badRequest(error.message || "Error creating POS order, please try again.");
  } finally {
    await session.endSession();
  }

  return mapOrder(newOrder, orderItems);
};

}
