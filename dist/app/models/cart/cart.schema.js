import mongoose, { Schema } from "mongoose";
const cartItemSchema = new Schema({
    variantId: { type: Schema.Types.ObjectId, ref: "Variant", required: true },
    quantity: { type: Number, required: true, min: 1 },
}, { _id: false });
const cartSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true,
    },
    items: {
        type: [cartItemSchema],
        default: [],
    },
}, { timestamps: true, collection: "carts", versionKey: false });
// TTL Index: Tự động xoá giỏ hàng nếu không có cập nhật trong vòng 30 ngày (Abandoned Carts cleanup)
cartSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
const Cart = mongoose.model("Cart", cartSchema);
export default Cart;
