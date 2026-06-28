/**
 * order.service.test.ts — Unit tests cho Order Service
 * Kiểm tra: cancelOrder (chỉ pending), updateOrderStatus (transition rules), getOrder (ownership).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../app/modules/order/order.repository.js");
vi.mock("../../app/modules/inventory/inventory.repository.js");
vi.mock("../../app/modules/order/dto/order.response.dto.js", () => ({
  mapOrder: (order: any, items: any[]) => ({ ...order, items }),
}));
vi.mock("../../app/modules/voucher/voucher.service.js", () => ({
  decrementVoucherUsage: vi.fn().mockResolvedValue(undefined),
  validateVoucher: vi.fn(),
  incrementVoucherUsage: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../app/models/user/user.schema.js", () => ({
  default: {
    findById: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue(null),
      lean: vi.fn().mockResolvedValue(null),
    }),
    findByIdAndUpdate: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock("../../app/models/order/order.schema.js", () => ({
  default: {},
  OrderDocument: {},
}));
vi.mock("../../app/models/user/point-history.schema.js", () => ({
  default: { create: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../../app/models/product/product.schema.js", () => ({
  default: { findByIdAndUpdate: vi.fn().mockResolvedValue(null) },
}));
vi.mock("../../app/models/inventory/inventory-transaction.schema.js", () => ({
  default: {},
}));
vi.mock("../../app/shared/email/email.service.js", () => ({
  sendOrderCancelledEmail: vi.fn().mockResolvedValue(undefined),
  sendOrderReturnedEmail: vi.fn().mockResolvedValue(undefined),
  sendOrderReturnRejectedEmail: vi.fn().mockResolvedValue(undefined),
  sendOrderShippedEmail: vi.fn().mockResolvedValue(undefined),
  sendOrderSuccessEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../app/modules/order/checkout/checkout.helper.js", () => ({
  ALLOWED_TRANSITIONS: {
    pending: ["processing", "cancelled"],
    processing: ["shipping", "cancelled"],
    shipping: ["completed", "returned"],
    completed: ["return_pending", "returned"],
    cancelled: [],
    returned: [],
    return_pending: ["completed", "returned"],
  },
  generateOrderCode: vi.fn(() => "ORD-001"),
  calculateTierDiscount: vi.fn(() => 0),
  getOrderSettings: vi.fn().mockResolvedValue({}),
  POINTS_EARN_RATE: 100,
  MAX_POINTS_PCT: 0.5,
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
  previewOrder: vi.fn(),
  createOrder: vi.fn(),
  createPOSOrder: vi.fn(),
}));

import mongoose from "mongoose";
vi.spyOn(mongoose, "startSession").mockResolvedValue({
  startTransaction: vi.fn(),
  commitTransaction: vi.fn(),
  abortTransaction: vi.fn(),
  endSession: vi.fn(),
} as any);

import * as orderRepo from "../../app/modules/order/order.repository.js";
import * as orderService from "../../app/modules/order/order.service.js";
import User from "../../app/models/user/user.schema.js";
import { decrementVoucherUsage } from "../../app/modules/voucher/voucher.service.js";

const FAKE_USER_ID = new mongoose.Types.ObjectId().toHexString();
const FAKE_ORDER_ID = "order_xyz";

const makeAdminUser = (overrides: Record<string, any> = {}) => ({
  _id: { toString: () => "admin_id" },
  role: "owner",
  ...overrides,
});

const makeFakeOrder = (overrides: Record<string, any> = {}) => ({
  _id: { toString: () => FAKE_ORDER_ID },
  code: "ORD-001",
  userId: FAKE_USER_ID,
  orderStatus: "pending",
  paymentStatus: "pending",
  items: [{ productId: "605c72a8b273b40015b6d91c", variantId: "605c72a8b273b40015b6d91d", quantity: 2 }],
  voucherCode: null,
  usedPoints: 0,
  earnedPoints: 0,
  totalAmount: 200_000,
  save: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  // Restore User.findById chain mock (vi.clearAllMocks resets return values)
  vi.mocked(User.findById as any).mockReturnValue({
    select: vi.fn().mockResolvedValue(null),
    lean: vi.fn().mockResolvedValue(null),
  });
});

// ── cancelOrder ───────────────────────────────────────────────────────────────

describe("orderService.cancelOrder", () => {
  it("hủy đơn thành công khi đơn ở trạng thái pending", async () => {
    const fakeOrder = makeFakeOrder();
    vi.mocked(orderRepo.findOrderById).mockResolvedValue(fakeOrder as any);
    vi.mocked(orderRepo.findOneAndUpdateOrder).mockResolvedValue({ ...fakeOrder, orderStatus: "cancelled" } as any);
    vi.mocked(orderRepo.saveOrder).mockResolvedValue(fakeOrder as any);
    vi.mocked(orderRepo.incrementVariantStock).mockResolvedValue(
      undefined as any,
    );
    vi.mocked(User.findById as any).mockResolvedValue(null);

    const requestUser = {
      _id: { toString: () => FAKE_USER_ID },
      role: "customer",
    };
    const result = await orderService.cancelOrder(
      FAKE_ORDER_ID,
      requestUser as any,
    );

    expect(result.orderStatus).toBe("cancelled");
  });

  it("throw badRequest khi đơn không ở trạng thái pending", async () => {
    const processingOrder = makeFakeOrder({ orderStatus: "processing" });
    vi.mocked(orderRepo.findOrderById).mockResolvedValue(
      processingOrder as any,
    );

    const requestUser = {
      _id: { toString: () => FAKE_USER_ID },
      role: "customer",
    };
    await expect(
      orderService.cancelOrder(FAKE_ORDER_ID, requestUser as any),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throw forbidden khi user không phải chủ đơn hàng và không phải admin", async () => {
    const fakeOrder = makeFakeOrder({ userId: "different_user" });
    vi.mocked(orderRepo.findOrderById).mockResolvedValue(fakeOrder as any);

    const requestUser = {
      _id: { toString: () => "another_user" },
      role: "customer",
    };
    await expect(
      orderService.cancelOrder(FAKE_ORDER_ID, requestUser as any),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("hoàn trả voucher khi hủy đơn có voucher", async () => {
    const fakeOrder = makeFakeOrder({ voucherCode: "GIAM10" });
    vi.mocked(orderRepo.findOrderById).mockResolvedValue(fakeOrder as any);
    vi.mocked(orderRepo.findOneAndUpdateOrder).mockResolvedValue({ ...fakeOrder, orderStatus: "cancelled" } as any);
    vi.mocked(orderRepo.saveOrder).mockResolvedValue(fakeOrder as any);
    vi.mocked(orderRepo.incrementVariantStock).mockResolvedValue(
      undefined as any,
    );
    vi.mocked(User.findById as any).mockResolvedValue(null);

    const requestUser = {
      _id: { toString: () => FAKE_USER_ID },
      role: "customer",
    };
    await orderService.cancelOrder(FAKE_ORDER_ID, requestUser as any);

    expect(decrementVoucherUsage).toHaveBeenCalledWith("GIAM10", FAKE_USER_ID, expect.anything());
  });
});

// ── updateOrderStatus ─────────────────────────────────────────────────────────

describe("orderService.updateOrderStatus", () => {
  it("chuyển trạng thái hợp lệ pending → processing thành công", async () => {
    const fakeOrder = makeFakeOrder({ orderStatus: "pending" });
    vi.mocked(orderRepo.findOne).mockResolvedValue(fakeOrder as any);
    vi.mocked(orderRepo.findOneAndUpdateOrder).mockResolvedValue({ ...fakeOrder, orderStatus: "processing" } as any);
    vi.mocked(orderRepo.saveOrder).mockResolvedValue(fakeOrder as any);

    const adminUser = makeAdminUser();
    const result = await orderService.updateOrderStatus(
      FAKE_ORDER_ID,
      { orderStatus: "processing" },
      adminUser as any,
    );
    expect(result.orderStatus).toBe("processing");
  });

  it("throw badRequest khi chuyển trạng thái không hợp lệ (pending → completed)", async () => {
    const fakeOrder = makeFakeOrder({ orderStatus: "pending" });
    vi.mocked(orderRepo.findOne).mockResolvedValue(fakeOrder as any);

    const adminUser = makeAdminUser();
    await expect(
      orderService.updateOrderStatus(
        FAKE_ORDER_ID,
        { orderStatus: "completed" },
        adminUser as any,
      ),
    ).rejects.toMatchObject({ status: 400 });
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

    const customer = {
      _id: { toString: () => FAKE_USER_ID },
      role: "customer",
    };
    const result = await orderService.getOrder(FAKE_ORDER_ID, customer as any);
    expect(result).toBeDefined();
  });

  it("throw forbidden khi customer cố xem đơn của người khác", async () => {
    const fakeOrder = makeFakeOrder({ userId: "other_user" });
    vi.mocked(orderRepo.findOrderById).mockResolvedValue(fakeOrder as any);

    const customer = {
      _id: { toString: () => "attacker_id" },
      role: "customer",
    };
    await expect(
      orderService.getOrder(FAKE_ORDER_ID, customer as any),
    ).rejects.toMatchObject({ status: 403 });
  });
});

// ── requestReturnOrder ───────────────────────────────────────────────────────

describe("orderService.requestReturnOrder", () => {
  it("thành công: đổi trạng thái sang return_pending và lưu lý do", async () => {
    const fakeOrder = makeFakeOrder({
      orderStatus: "completed",
      completedAt: new Date(),
    });
    vi.mocked(orderRepo.findOrderById).mockResolvedValue(fakeOrder as any);

    const customer = {
      _id: { toString: () => FAKE_USER_ID },
      role: "customer",
    };

    const result = await orderService.requestReturnOrder(
      FAKE_ORDER_ID,
      customer as any,
      "Hàng bị lỗi",
    );

    expect(result.orderStatus).toBe("return_pending");
    expect((fakeOrder as any).returnReason).toBe("Hàng bị lỗi");
    expect(fakeOrder.save).toHaveBeenCalledOnce();
  });

  it("thất bại: throw badRequest nếu không nhập lý do", async () => {
    const customer = {
      _id: { toString: () => FAKE_USER_ID },
      role: "customer",
    };

    await expect(
      orderService.requestReturnOrder(FAKE_ORDER_ID, customer as any, "   "),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("thất bại: throw badRequest nếu đơn chưa hoàn tất", async () => {
    const fakeOrder = makeFakeOrder({ orderStatus: "shipping" });
    vi.mocked(orderRepo.findOrderById).mockResolvedValue(fakeOrder as any);

    const customer = {
      _id: { toString: () => FAKE_USER_ID },
      role: "customer",
    };

    await expect(
      orderService.requestReturnOrder(FAKE_ORDER_ID, customer as any, "Lỗi"),
    ).rejects.toMatchObject({ status: 400, message: "Chỉ có thể yêu cầu trả hàng cho đơn hàng đã hoàn tất" });
  });

  it("thất bại: throw badRequest nếu quá 14 ngày", async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 15); // Quá 14 ngày
    const fakeOrder = makeFakeOrder({
      orderStatus: "completed",
      completedAt: pastDate,
    });
    vi.mocked(orderRepo.findOrderById).mockResolvedValue(fakeOrder as any);

    const customer = {
      _id: { toString: () => FAKE_USER_ID },
      role: "customer",
    };

    await expect(
      orderService.requestReturnOrder(FAKE_ORDER_ID, customer as any, "Lỗi"),
    ).rejects.toMatchObject({ status: 400, message: "Đã quá thời hạn 15 ngày để yêu cầu trả hàng" });
  });
});

// ── updateOrderStatus (Reject Return) ─────────────────────────────────────────

import { sendOrderReturnRejectedEmail } from "../../app/shared/email/email.service.js";

describe("orderService.updateOrderStatus (Reject Return)", () => {
  it("gửi email từ chối khi chuyển từ return_pending sang completed", async () => {
    const fakeOrder = makeFakeOrder({ orderStatus: "return_pending" });
    vi.mocked(orderRepo.findOne).mockResolvedValue(fakeOrder as any);
    vi.mocked(orderRepo.findOneAndUpdateOrder).mockResolvedValue({ ...fakeOrder, orderStatus: "completed" } as any);
    vi.mocked(orderRepo.saveOrder).mockResolvedValue(fakeOrder as any);
    
    // Mock user email
    vi.mocked(User.findById as any).mockReturnValue({
      select: vi.fn().mockResolvedValue({ email: "test@example.com" }),
      lean: vi.fn().mockResolvedValue({ email: "test@example.com" }),
    });

    const adminUser = makeAdminUser();
    
    // ALLOWED_TRANSITIONS có return_pending -> completed không? Có, ta đã add.
    const result = await orderService.updateOrderStatus(
      FAKE_ORDER_ID,
      { orderStatus: "completed" },
      adminUser as any,
    );

    expect(result.orderStatus).toBe("completed");
    expect(sendOrderReturnRejectedEmail).toHaveBeenCalledWith("test@example.com", "ORD-001");
  });
});
