import mongoose, { Document, Schema, Types } from "mongoose";

export interface IBatch {
  variantId: Types.ObjectId;
  goodsReceiptId: Types.ObjectId | null;
  batchCode?: string;
  manufactureDate?: Date;
  expiryDate?: Date;
  importPrice: number;
  originalQty: number;
  remainingQty: number;
  createdAt: Date;
}

export type BatchDocument = Document & IBatch;

const batchSchema = new Schema<BatchDocument>(
  {
    variantId: { type: Schema.Types.ObjectId, ref: "Variant", required: true },
    goodsReceiptId: { type: Schema.Types.ObjectId, ref: "GoodsReceipt", default: null },
    batchCode: { type: String, trim: true },
    manufactureDate: { type: Date },
    expiryDate: { type: Date },
    importPrice: { type: Number, required: true, min: 0 },
    originalQty: { type: Number, required: true, min: 1 },
    remainingQty: { type: Number, required: true, min: 0 },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "batches", versionKey: false },
);

// Indexes for fast FEFO querying
batchSchema.index({ variantId: 1, remainingQty: 1, expiryDate: 1, createdAt: 1 });
// Index for goods receipt aggregation
batchSchema.index({ goodsReceiptId: 1 });

const Batch = mongoose.model<BatchDocument>("Batch", batchSchema);

export default Batch;
