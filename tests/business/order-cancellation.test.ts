import { describe, it, expect, vi, beforeEach } from "vitest";
import * as orderService from "../../app/modules/order/order.service.js";
import * as orderRepo from "../../app/modules/order/order.repository.js";
import * as paymentService from "../../app/modules/order/payment/payment.service.js";
import User from "../../app/models/user/user.schema.js";
import mongoose from "mongoose";

vi.mock("../../app/modules/order/order.repository.js");
vi.mock("../../app/modules/order/payment/payment.service.js");
vi.mock("../../app/modules/inventory/inventory.repository.js");
vi.mock("../../app/modules/voucher/voucher.repository.js");

const mockSession = {
  startTransaction: vi.fn(),
  commitTransaction: vi.fn(),
  abortTransaction: vi.fn(),
  endSession: vi.fn(),
};
vi.spyOn(mongoose, 'startSession').mockResolvedValue(mockSession as any);
vi.spyOn(User, 'findById').mockResolvedValue({ email: "test@example.com" } as any);

const makeFakeOrder = (overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  userId: new mongoose.Types.ObjectId(),
  orderStatus: "pending",
  paymentStatus: "unpaid",
  paymentMethod: "COD",
  items: [
    {
      productId: new mongoose.Types.ObjectId(),
      variantId: new mongoose.Types.ObjectId(),
      quantity: 2,
    }
  ],
  totalAmount: 100000,
  ...overrides,
});

const FAKE_USER_ID = new mongoose.Types.ObjectId().toString();

describe("Business Logic: Order Cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Không thể hủy đơn hàng đã bắt đầu giao (shipping)", async () => {
    const order = makeFakeOrder({ orderStatus: "shipping" });
    vi.mocked(orderRepo.findOrderById).mockResolvedValue(order as any);

    const customer = { _id: order.userId.toString(), role: "customer" };

    await expect(
      orderService.cancelOrder(order._id.toString(), customer as any)
    ).rejects.toMatchObject({
      status: 400,
      message: "Chỉ có thể hủy đơn hàng đang chờ xử lý",
    });
  });

  it("Hủy đơn hàng đã thanh toán (VNPAY) sẽ gọi hàm hoàn tiền", async () => {
    const order = makeFakeOrder({ 
      orderStatus: "pending", 
      paymentStatus: "paid", 
      paymentMethod: "VNPAY" 
    });
    vi.mocked(orderRepo.findOrderById).mockResolvedValue(order as any);
    (vi.mocked(orderRepo.findOneAndUpdateOrder) as any).mockImplementation(async () => {
      order.orderStatus = "cancelled";
      return order as any;
    });
    vi.mocked(paymentService.refundPayment).mockResolvedValue(undefined as any);

    const customer = { _id: order.userId.toString(), role: "customer" };

    await orderService.cancelOrder(order._id.toString(), customer as any);

    expect(order.orderStatus).toBe("cancelled");
    expect(paymentService.refundPayment).toHaveBeenCalledWith(order._id.toString());
  });

  it("Hủy đơn hàng COD không cần hoàn tiền", async () => {
    const order = makeFakeOrder({ 
      orderStatus: "pending", 
      paymentStatus: "unpaid", 
      paymentMethod: "COD" 
    });
    vi.mocked(orderRepo.findOrderById).mockResolvedValue(order as any);
    (vi.mocked(orderRepo.findOneAndUpdateOrder) as any).mockImplementation(async () => {
      order.orderStatus = "cancelled";
      return order as any;
    });

    const customer = { _id: order.userId.toString(), role: "customer" };

    await orderService.cancelOrder(order._id.toString(), customer as any);

    expect(order.orderStatus).toBe("cancelled");
    expect(paymentService.refundPayment).not.toHaveBeenCalled();
  });
});
