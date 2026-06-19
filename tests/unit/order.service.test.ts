/**
 * order.service.test.ts — Unit tests cho Order Service
 * Kiểm tra: cancelOrder (chỉ pending), updateOrderStatus (transition rules), getOrder (ownership).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../app/modules/order/order.repository.js");
vi.mock("../../app/modules/order/dto/order.response.dto.js", () => ({
  mapOrder: (order: any, items: any[]) => ({ ...order, items }),
}));
vi.mock("../../app/modules/voucher/voucher.service.js", () => ({
  decrementVoucherUsage: vi.fn().mockResolvedValue(undefined),
  validateVoucher:       vi.fn(),
  incrementVoucherUsage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../app/models/user.schema.js", () => ({
  default: { findById: vi.fn() },
}));
vi.mock("../../app/models/order.schema.js", () => ({
  default: {},
  OrderDocument: {},
}));
vi.mock("../../app/models/point-history.schema.js", () => ({
  default: { create: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../../app/models/product.schema.js", () => ({
  default: { findByIdAndUpdate: vi.fn().mockResolvedValue(null) },
}));
vi.mock("../../app/models/inventory-transaction.schema.js", () => ({
  default: {},
}));
vi.mock("../../app/shared/email/email.service.js", () => ({
  sendOrderCancelledEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../app/modules/order/order.helper.js", () => ({
  ALLOWED_TRANSITIONS: {
    pending:    ["processing", "cancelled"],
    processing: ["shipping", "cancelled"],
    shipping:   ["completed", "returned"],
    completed:  ["returned"],
    cancelled:  [],
    returned:   [],
  },
  generateOrderCode:  vi.fn(() => "ORD-001"),
  calculateTierDiscount: vi.fn(() => 0),
  getOrderSettings:   vi.fn().mockResolvedValue({}),
  POINTS_EARN_RATE:   100,
  MAX_POINTS_PCT:     0.5,
  DEFAULT_ITEM_WEIGHT_G: 200,
  WEIGHT_SURCHARGE_STEP_G: 500,
  WEIGHT_SURCHARGE_PER_STEP: 5000,
  WEIGHT_BASE_G: 500,
  FREE_SHIP_THRESHOLD: 500_000,
  DEFAULT_SHIPPING_FEE: 30_000,
}));
vi.mock("../../app/modules/order/order.shipping.js", () => ({
  calcShippingFee: vi.fn(() => 30_000),
  calcShippingFeeFromSettings: vi.fn(() => 30_000),
}));
vi.mock("../../app/modules/order/order.payment.js", () => ({
  createVnpayUrl: vi.fn(),
  handleVnpayIpn: vi.fn(),
}));
vi.mock("../../app/modules/order/order.checkout.js", () => ({
  getUserTotalSpent: vi.fn(),
  previewOrder:      vi.fn(),
  createOrder:       vi.fn(),
  createPOSOrder:    vi.fn(),
}));

import * as orderRepo from "../../app/modules/order/order.repository.js";
import * as orderService from "../../app/modules/order/order.service.js";
import User from "../../app/models/user.schema.js";
import { decrementVoucherUsage } from "../../app/modules/voucher/voucher.service.js";

const FAKE_USER_ID  = "user_abc";
const FAKE_ORDER_ID = "order_xyz";

const makeAdminUser = (overrides: Record<string, any> = {}) => ({
  _id:  { toString: () => "admin_id" },
  role: "owner",
  ...overrides,
});

const makeFakeOrder = (overrides: Record<string, any> = {}) => ({
  _id:         { toString: () => FAKE_ORDER_ID },
  code:        "ORD-001",
  userId:      FAKE_USER_ID,
  orderStatus: "pending",
  paymentStatus: "pending",
  items:       [{ productId: "prod_id", variantId: "var_id", quantity: 2 }],
  voucherCode: null,
  usedPoints:  0,
  earnedPoints: 0,
  totalAmount: 200_000,
  save:        vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

beforeEach(() => vi.clearAllMocks());

// ── cancelOrder ───────────────────────────────────────────────────────────────

describe("orderService.cancelOrder", () => {
  it("hủy đơn thành công khi đơn ở trạng thái pending", async () => {
    const fakeOrder = makeFakeOrder();
    vi.mocked(orderRepo.findOrderById).mockResolvedValue(fakeOrder as any);
    vi.mocked(orderRepo.saveOrder).mockResolvedValue(fakeOrder as any);
    vi.mocked(orderRepo.incrementVariantStock).mockResolvedValue(undefined as any);
    vi.mocked(User.findById as any).mockResolvedValue(null);

    const requestUser = { _id: { toString: () => FAKE_USER_ID }, role: "customer" };
    const result = await orderService.cancelOrder(FAKE_ORDER_ID, requestUser as any);

    expect(result.orderStatus).toBe("cancelled");
    expect(orderRepo.saveOrder).toHaveBeenCalledOnce();
  });

  it("throw badRequest khi đơn không ở trạng thái pending", async () => {
    const processingOrder = makeFakeOrder({ orderStatus: "processing" });
    vi.mocked(orderRepo.findOrderById).mockResolvedValue(processingOrder as any);

    const requestUser = { _id: { toString: () => FAKE_USER_ID }, role: "customer" };
    await expect(orderService.cancelOrder(FAKE_ORDER_ID, requestUser as any))
      .rejects.toMatchObject({ status: 400 });
  });

  it("throw forbidden khi user không phải chủ đơn hàng và không phải admin", async () => {
    const fakeOrder = makeFakeOrder({ userId: "different_user" });
    vi.mocked(orderRepo.findOrderById).mockResolvedValue(fakeOrder as any);

    const requestUser = { _id: { toString: () => "another_user" }, role: "customer" };
    await expect(orderService.cancelOrder(FAKE_ORDER_ID, requestUser as any))
      .rejects.toMatchObject({ status: 403 });
  });

  it("hoàn trả voucher khi hủy đơn có voucher", async () => {
    const fakeOrder = makeFakeOrder({ voucherCode: "GIAM10" });
    vi.mocked(orderRepo.findOrderById).mockResolvedValue(fakeOrder as any);
    vi.mocked(orderRepo.saveOrder).mockResolvedValue(fakeOrder as any);
    vi.mocked(orderRepo.incrementVariantStock).mockResolvedValue(undefined as any);
    vi.mocked(User.findById as any).mockResolvedValue(null);

    const requestUser = { _id: { toString: () => FAKE_USER_ID }, role: "customer" };
    await orderService.cancelOrder(FAKE_ORDER_ID, requestUser as any);

    expect(decrementVoucherUsage).toHaveBeenCalledWith("GIAM10", FAKE_USER_ID);
  });
});

// ── updateOrderStatus ─────────────────────────────────────────────────────────

describe("orderService.updateOrderStatus", () => {
  it("chuyển trạng thái hợp lệ pending → processing thành công", async () => {
    const fakeOrder = makeFakeOrder({ orderStatus: "pending" });
    vi.mocked(orderRepo.findOne).mockResolvedValue(fakeOrder as any);
    vi.mocked(orderRepo.saveOrder).mockResolvedValue(fakeOrder as any);

    const adminUser = makeAdminUser();
    const result = await orderService.updateOrderStatus(FAKE_ORDER_ID, { orderStatus: "processing" }, adminUser as any);
    expect(result.orderStatus).toBe("processing");
  });

  it("throw badRequest khi chuyển trạng thái không hợp lệ (pending → completed)", async () => {
    const fakeOrder = makeFakeOrder({ orderStatus: "pending" });
    vi.mocked(orderRepo.findOne).mockResolvedValue(fakeOrder as any);

    const adminUser = makeAdminUser();
    await expect(orderService.updateOrderStatus(FAKE_ORDER_ID, { orderStatus: "completed" }, adminUser as any))
      .rejects.toMatchObject({ status: 400 });
  });
});

// ── getOrder ──────────────────────────────────────────────────────────────────

describe("orderService.getOrder", () => {
  it("admin có thể xem bất kỳ đơn hàng nào", async () => {
    const fakeOrder = makeFakeOrder({ userId: "some_user" });
    vi.mocked(orderRepo.findOrderById).mockResolvedValue(fakeOrder as any);

    const adminUser = makeAdminUser();
    const result = await orderService.getOrder(FAKE_ORDER_ID, adminUser as any);
    expect(result).toBeDefined();
  });

  it("customer chỉ xem được đơn hàng của mình", async () => {
    const fakeOrder = makeFakeOrder({ userId: FAKE_USER_ID });
    vi.mocked(orderRepo.findOrderById).mockResolvedValue(fakeOrder as any);

    const customer = { _id: { toString: () => FAKE_USER_ID }, role: "customer" };
    const result = await orderService.getOrder(FAKE_ORDER_ID, customer as any);
    expect(result).toBeDefined();
  });

  it("throw forbidden khi customer cố xem đơn của người khác", async () => {
    const fakeOrder = makeFakeOrder({ userId: "other_user" });
    vi.mocked(orderRepo.findOrderById).mockResolvedValue(fakeOrder as any);

    const customer = { _id: { toString: () => "attacker_id" }, role: "customer" };
    await expect(orderService.getOrder(FAKE_ORDER_ID, customer as any))
      .rejects.toMatchObject({ status: 403 });
  });
});
