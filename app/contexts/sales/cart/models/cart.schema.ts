import mongoose, { Document, Schema, Types } from "mongoose";

export interface ICartItem {
  variantId: Types.ObjectId;
  quantity: number;
}

export interface ICart {
  userId: Types.ObjectId;
  items: ICartItem[];
}

export type CartDocument = Document & ICart;

const cartItemSchema = new Schema<ICartItem>(
  {
    variantId: { type: Schema.Types.ObjectId, ref: "Variant", required: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const cartSchema = new Schema<CartDocument>(
  {
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
  },
  { timestamps: true, collection: "carts", versionKey: false },
);

// TTL Index: Tự động xoá giỏ hàng nếu không có cập nhật trong vòng 30 ngày (Abandoned Carts cleanup)
cartSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const Cart = mongoose.model<CartDocument>("Cart", cartSchema);
export default Cart;
