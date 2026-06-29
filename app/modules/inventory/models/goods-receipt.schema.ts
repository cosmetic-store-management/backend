import mongoose, { Document, Schema, Types } from "mongoose";

export interface IGoodsReceiptItem {
  productId: Types.ObjectId;
  variantId: Types.ObjectId;
  productName: string;
  variantName: string;
  quantity: number;
  importPrice: number;
}

export interface IGoodsReceipt {
  code: string;
  supplierId: Types.ObjectId;
  items: IGoodsReceiptItem[];
  totalAmount: number;
  creatorId: Types.ObjectId;
}

export type GoodsReceiptDocument = Document & IGoodsReceipt;

const goodsReceiptItemSchema = new Schema<IGoodsReceiptItem>({
  productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  variantId: { type: Schema.Types.ObjectId, ref: "Variant", required: true },
  productName: { type: String, required: true, trim: true },
  variantName: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: 1 },
  importPrice: { type: Number, required: true, min: 0 },
});

const goodsReceiptSchema = new Schema<GoodsReceiptDocument>(
  {
    code: { type: String, required: true, unique: true, trim: true },
    supplierId: {
      type: Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
    },
    items: [goodsReceiptItemSchema],
    totalAmount: { type: Number, required: true, min: 0 },
    creatorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, collection: "goods_receipts", versionKey: false },
);

goodsReceiptSchema.index({ supplierId: 1 });
goodsReceiptSchema.index({ creatorId: 1 });

const GoodsReceipt = mongoose.model<GoodsReceiptDocument>(
  "GoodsReceipt",
  goodsReceiptSchema,
);

export default GoodsReceipt;
