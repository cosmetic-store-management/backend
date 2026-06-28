import mongoose, { Schema } from "mongoose";
const PaymentTransactionSchema = new Schema({
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    paymentMethod: {
        type: String,
        enum: ["stripe", "cod", "cash", "pos_card", "transfer", "bank"],
        required: true,
    },
    providerTransactionId: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "VND" },
    type: { type: String, enum: ["charge", "refund"], default: "charge" },
    status: {
        type: String,
        enum: ["pending", "success", "failed", "refunded"],
        default: "pending",
    },
    metaData: { type: Schema.Types.Mixed }, // Raw response from Stripe
}, { timestamps: true });
export default mongoose.model("PaymentTransaction", PaymentTransactionSchema);
