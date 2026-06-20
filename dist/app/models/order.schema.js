import mongoose, { Schema } from "mongoose";
const orderSchema = new Schema({
    code: { type: String, required: true, unique: true, trim: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    receiverName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    province: { type: String, required: true, trim: true },
    district: { type: String, required: true, trim: true },
    ward: { type: String, required: true, trim: true },
    street: { type: String, required: true, trim: true },
    orderStatus: { type: String, enum: ["pending", "processing", "shipping", "completed", "cancelled", "returned"], default: "pending", index: true },
    paymentMethod: { type: String, enum: ["cod", "bank", "ewallet", "qr", "cash", "card", "vnpay"], required: true },
    subtotal: { type: Number, required: true, min: 0 },
    shippingFee: { type: Number, required: true, min: 0, default: 0 },
    voucherCode: { type: String, trim: true, default: "" },
    discountAmount: { type: Number, min: 0, default: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    note: { type: String, trim: true, default: "" },
    channel: { type: String, enum: ["pos", "online"], default: "online" },
    creatorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    paymentStatus: { type: String, enum: ["pending", "paid", "failed", "refund_pending"], default: "pending", index: true },
    idempotencyKey: { type: String, unique: true, sparse: true },
    trackingCode: { type: String, trim: true, default: "" },
    earnedPoints: { type: Number, min: 0, default: 0 },
    usedPoints: { type: Number, min: 0, default: 0 },
    tierDiscountAmount: { type: Number, min: 0, default: 0 },
    items: [
        {
            _id: false,
            productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
            variantId: { type: Schema.Types.ObjectId, ref: "Variant", required: true },
            productName: { type: String, required: true, trim: true },
            variantName: { type: String, required: true, trim: true },
            imageUrl: { type: String, trim: true, default: "" },
            price: { type: Number, required: true, min: 0 },
            quantity: { type: Number, required: true, min: 1 },
            lineTotal: { type: Number, required: true, min: 0 },
        }
    ]
}, { timestamps: true, collection: "orders" });
orderSchema.index({ orderStatus: 1, createdAt: -1 });
const Order = mongoose.model("Order", orderSchema);
export default Order;
