/**
 * order.integration.test.ts — Integration tests cho Order Service + Repository
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  connectTestDB,
  disconnectTestDB,
  clearCollections,
} from "./helpers/db-helper.js";
import * as orderService from "../../app/modules/order/order.service.js";
import Order from "../../app/models/order/order.schema.js";
import User from "../../app/models/user/user.schema.js";
import Variant from "../../app/models/product/variant.schema.js";
import Product from "../../app/models/product/product.schema.js";
import Category from "../../app/models/product/category.schema.js";
import mongoose from "mongoose";

let userId: string;
let variantId: string;
let productId: string;
let staffUser: any;

beforeAll(async () => {
  await connectTestDB();
});
afterAll(async () => {
  await disconnectTestDB();
});

beforeEach(async () => {
  await clearCollections();

  const cat = await Category.create({
    name: "Skincare",
    slug: "skincare",
    isActive: true,
  });
  const product = await Product.create({
    name: "Kem",
    slug: "kem",
    categoryId: cat._id,
    brandId: new mongoose.Types.ObjectId(),
    isActive: true,
    imageUrl: "x.jpg",
  });
  const variant = await Variant.create({
    productId: product._id,
    name: "50ml",
    sku: "SKU1",
    price: 100_000,
    stock: 50,
    minStock: 5,
  });
  const user = await User.create({
    name: "Customer",
    phone: "0900000001",
    role: "customer",
  });
  staffUser = await User.create({
    name: "Staff",
    phone: "0900000002",
    role: "staff",
  });

  userId = user._id.toString();
  variantId = variant._id.toString();
  productId = product._id.toString();
});

// Helper: tạo order trực tiếp trong DB
const seedOrder = async (overrides: Record<string, any> = {}) =>
  Order.create({
    code: "ORD-IT-001",
    userId: new mongoose.Types.ObjectId(userId),
    orderStatus: "pending",
    paymentStatus: "pending",
    paymentMethod: "cod",
    channel: "online",
    subtotal: 200_000,
    totalAmount: 200_000,
    shippingFee: 30_000,
    tierDiscountAmount: 0,
    items: [
      {
        productId: new mongoose.Types.ObjectId(productId),
        variantId: new mongoose.Types.ObjectId(variantId),
        quantity: 2,
        productName: "Kem 50ml",
        variantName: "50ml",
        imageUrl: "",
        price: 100_000,
        lineTotal: 200_000,
      },
    ],
    receiverName: "Customer",
    phone: "0900000001",
    province: "HCM",
    district: "Q1",
    ward: "P1",
    street: "123 Lê Lợi",
    ...overrides,
  });

// ── cancelOrder ───────────────────────────────────────────────────────────────

describe("[Integration] Order — cancelOrder", () => {
  it("hủy đơn pending thành công và hoàn lại stock", async () => {
    const order = await seedOrder();
    const requestUser = {
      _id: new mongoose.Types.ObjectId(userId),
      role: "customer",
    } as any;

    await orderService.cancelOrder(order._id.toString(), requestUser);

    const cancelled = await Order.findById(order._id);
    expect(cancelled?.orderStatus).toBe("cancelled");

    // Stock phải được hoàn lại (+2)
    const variant = await Variant.findById(variantId);
    expect(variant?.stock).toBe(52); // 50 + 2
  });

  it("throw badRequest khi đơn đang xử lý (processing)", async () => {
    const order = await seedOrder({ orderStatus: "processing" });
    const requestUser = {
      _id: new mongoose.Types.ObjectId(userId),
      role: "customer",
    } as any;

    await expect(
      orderService.cancelOrder(order._id.toString(), requestUser),
    ).rejects.toMatchObject({ status: 400 });
  });
});

// ── updateOrderStatus ─────────────────────────────────────────────────────────

describe("[Integration] Order — updateOrderStatus (staff)", () => {
  it("chuyển pending → processing thành công", async () => {
    const order = await seedOrder();

    const result = await orderService.updateOrderStatus(
      order._id.toString(),
      { orderStatus: "processing" },
      staffUser,
    );
    expect(result.orderStatus).toBe("processing");

    const inDB = await Order.findById(order._id);
    expect(inDB?.orderStatus).toBe("processing");
  });

  it("throw badRequest khi chuyển pending → completed (bỏ qua bước)", async () => {
    const order = await seedOrder();

    await expect(
      orderService.updateOrderStatus(
        order._id.toString(),
        { orderStatus: "completed" },
        staffUser,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});

// ── getMyOrders ───────────────────────────────────────────────────────────────

describe("[Integration] Order — getMyOrders", () => {
  it("trả về đúng danh sách đơn hàng của user", async () => {
    await seedOrder();
    await seedOrder({
      code: "ORD-IT-002",
      userId: new mongoose.Types.ObjectId(userId),
    });

    const orders = await orderService.getMyOrders(userId);
    expect(orders.length).toBe(2);
    orders.forEach((o) => expect(o.userId?.toString()).toBe(userId));
  });
});
