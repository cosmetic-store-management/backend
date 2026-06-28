import mongoose, { Schema } from "mongoose";
const batchSchema = new Schema({
    variantId: { type: Schema.Types.ObjectId, ref: "Variant", required: true },
    goodsReceiptId: { type: Schema.Types.ObjectId, ref: "GoodsReceipt", default: null },
    batchCode: { type: String, trim: true },
    manufactureDate: { type: Date },
    expiryDate: { type: Date },
    importPrice: { type: Number, required: true, min: 0 },
    originalQty: { type: Number, required: true, min: 1 },
    remainingQty: { type: Number, required: true, min: 0 },
    createdAt: { type: Date, default: Date.now },
}, { timestamps: true, collection: "batches", versionKey: false });
// Indexes for fast FEFO querying
batchSchema.index({ variantId: 1, remainingQty: 1, expiryDate: 1, createdAt: 1 });
// Index for goods receipt aggregation
batchSchema.index({ goodsReceiptId: 1 });
const Batch = mongoose.model("Batch", batchSchema);
export default Batch;
