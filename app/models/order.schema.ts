import mongoose, { Document, Schema, Types } from "mongoose";

export type OrderStatus  = "pending" | "processing" | "shipping" | "completed" | "cancelled" | "returned";
export type PaymentMethod = "cod" | "bank" | "ewallet" | "qr" | "cash" | "card" | "vnpay";
export type PaymentStatus = "pending" | "paid" | "failed" | "refund_pending";

export interface IOrderItem {
  productId: Types.ObjectId;
  variantId: Types.ObjectId;
  productName: string;
  variantName: string;
  imageUrl: string;
  price: number;
  quantity: number;
  lineTotal: number;
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
  trackingCode?: string;
  earnedPoints?: number;
  usedPoints?: number;
  tierDiscountAmount: number;
  items: IOrderItem[];
}

export type OrderDocument = Document & IOrder;

const orderSchema = new Schema<OrderDocument>(
  {
    code:          { type: String, required: true, unique: true, trim: true },
    userId:        { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    receiverName:  { type: String, required: true, trim: true },
    phone:         { type: String, required: true, trim: true },
    province:      { type: String, required: true, trim: true },
    district:      { type: String, required: true, trim: true },
    ward:          { type: String, required: true, trim: true },
    street:        { type: String, required: true, trim: true },
    orderStatus:   { type: String, enum: ["pending","processing","shipping","completed","cancelled","returned"], default: "pending", index: true },
    paymentMethod: { type: String, enum: ["cod","bank","ewallet","qr","cash","card","vnpay"], required: true },
    subtotal:      { type: Number, required: true, min: 0 },
    shippingFee:   { type: Number, required: true, min: 0, default: 0 },
    voucherCode:   { type: String, trim: true, default: "" },
    discountAmount:{ type: Number, min: 0, default: 0 },
    totalAmount:   { type: Number, required: true, min: 0 },
    note:          { type: String, trim: true, default: "" },
    channel:       { type: String, enum: ["pos","online"], default: "online" },
    creatorId:     { type: Schema.Types.ObjectId, ref: "User", default: null },
    paymentStatus: { type: String, enum: ["pending","paid","failed","refund_pending"], default: "pending", index: true },
    idempotencyKey: { type: String, unique: true, sparse: true },
    trackingCode:  { type: String, trim: true, default: "" },
    earnedPoints:  { type: Number, min: 0, default: 0 },
    usedPoints:    { type: Number, min: 0, default: 0 },
    tierDiscountAmount: { type: Number, min: 0, default: 0 },
    items: [
      {
        _id: false,
        productId:   { type: Schema.Types.ObjectId, ref: "Product", required: true },
        variantId:   { type: Schema.Types.ObjectId, ref: "Variant", required: true },
        productName: { type: String, required: true, trim: true },
        variantName: { type: String, required: true, trim: true },
        imageUrl:    { type: String, trim: true, default: "" },
        price:       { type: Number, required: true, min: 0 },
        quantity:    { type: Number, required: true, min: 1 },
        lineTotal:   { type: Number, required: true, min: 0 },
      }
    ]
  },
  { timestamps: true, collection: "orders" }
);


orderSchema.index({ orderStatus: 1, createdAt: -1 });

const Order = mongoose.model<OrderDocument>("Order", orderSchema);

export default Order;
