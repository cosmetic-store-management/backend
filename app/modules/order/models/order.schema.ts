import mongoose, { Document, Schema, Types } from "mongoose";

export type OrderStatus =
  | "pending"
  | "processing"
  | "shipping"
  | "completed"
  | "cancelled"
  | "return_pending"
  | "returned";
export type PaymentMethod =
  | "cod"
  | "stripe"
  | "cash"
  | "pos_card"
  | "transfer"
  | "bank";
export type PaymentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "refund_pending"
  | "refunded";

export interface IOrderItem {
  productId: Types.ObjectId;
  variantId: Types.ObjectId;
  productName: string;
  variantName: string;
  imageUrl: string;
  price: number;
  quantity: number;
  lineTotal: number;
  costPriceTotal: number;
}

export interface IOrder {
  code: string;
  userId: Types.ObjectId | null;
  receiverName: string;
  phone: string;
  province: string;
  district: string;
  ward: string;
  street: string;
  orderStatus: OrderStatus;
  paymentMethod: PaymentMethod;
  subtotal: number;
  shippingFee: number;
  voucherCode: string;
  discountAmount: number;
  totalAmount: number;
  note: string;
  channel: "pos" | "online";
  creatorId: Types.ObjectId | null;
  paymentStatus: PaymentStatus;
  idempotencyKey?: string;
  transactionId?: string;
  earnedPoints?: number;
  usedPoints?: number;
  tierDiscountAmount: number;
  completedAt?: Date;
  cancellationReason?: string;
  cancelledAt?: Date;
  returnReason?: string;
  returnImages?: string[];
  returnRequestedAt?: Date;
  returnRejectReason?: string;
  receiptNumber?: string;
  totalCost: number;
  items: IOrderItem[];
  createdAt: Date;
  updatedAt: Date;
}

export type OrderDocument = Document & IOrder;

const orderSchema = new Schema<OrderDocument>(
  {
    code: { type: String, required: true, unique: true, trim: true },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    receiverName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    province: { type: String, required: true, trim: true },
    district: { type: String, required: true, trim: true },
    ward: { type: String, required: true, trim: true },
    street: { type: String, required: true, trim: true },
    orderStatus: {
      type: String,
      enum: [
        "pending",
        "processing",
        "shipping",
        "completed",
        "cancelled",
        "return_pending",
        "returned",
      ],
      default: "pending",
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ["cod", "stripe", "cash", "pos_card", "transfer", "bank"],
      required: true,
    },
    subtotal: { type: Number, required: true, min: 0 },
    shippingFee: { type: Number, required: true, min: 0, default: 0 },
    voucherCode: { type: String, trim: true, default: "" },
    discountAmount: { type: Number, min: 0, default: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    note: { type: String, trim: true, default: "" },
    channel: { type: String, enum: ["pos", "online"], default: "online" },
    creatorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    receiptNumber: { type: String, trim: true, default: "", index: true },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refund_pending", "refunded"],
      default: "pending",
      index: true,
    },
    idempotencyKey: { type: String, unique: true, sparse: true },
    transactionId: { type: String, trim: true, default: "" },
    earnedPoints: { type: Number, min: 0, default: 0 },
    usedPoints: { type: Number, min: 0, default: 0 },
    tierDiscountAmount: { type: Number, min: 0, default: 0 },
    completedAt: { type: Date },
    returnReason: { type: String, trim: true, default: "" },
    returnImages: { type: [String], default: [] },
    returnRequestedAt: { type: Date },
    returnRejectReason: { type: String, trim: true, default: "" },
    totalCost: { type: Number, default: 0 },
    items: [
      {
        _id: false,
        productId: {
          type: Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        variantId: {
          type: Schema.Types.ObjectId,
          ref: "Variant",
          required: true,
        },
        productName: { type: String, required: true, trim: true },
        variantName: { type: String, required: true, trim: true },
        barcode: { type: String, trim: true, default: "" },
        imageUrl: { type: String, trim: true, default: "" },
        price: { type: Number, required: true, min: 0 },
        quantity: { type: Number, required: true, min: 1 },
        lineTotal: { type: Number, required: true, min: 0 },
        costPriceTotal: { type: Number, default: 0 },
      },
    ],
  },
  { timestamps: true, collection: "orders" },
);

// ── Indexes ───────────────────────────────────────────────────────────────────
// Admin list: filter theo status + sort theo ngày
orderSchema.index({ orderStatus: 1, createdAt: -1 });
// Customer lịch sử đơn hàng + filter theo status
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ userId: 1, orderStatus: 1 });
// Báo cáo doanh thu theo khoảng thời gian
orderSchema.index({ createdAt: -1, paymentStatus: 1 });
// Phân tách channel (POS vs online)
orderSchema.index({ channel: 1, orderStatus: 1, createdAt: -1 });
// Tìm theo tên người nhận, SĐT (text search — admin)
orderSchema.index({ phone: 1 });

const Order = mongoose.model<OrderDocument>("Order", orderSchema);

export default Order;
