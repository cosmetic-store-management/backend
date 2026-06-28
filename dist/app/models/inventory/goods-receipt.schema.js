import mongoose, { Schema } from "mongoose";
const goodsReceiptItemSchema = new Schema({
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: Schema.Types.ObjectId, ref: "Variant", required: true },
    productName: { type: String, required: true, trim: true },
    variantName: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    importPrice: { type: Number, required: true, min: 0 },
});
const goodsReceiptSchema = new Schema({
    code: { type: String, required: true, unique: true, trim: true },
    supplierId: {
        type: Schema.Types.ObjectId,
        ref: "Supplier",
        required: true,
    },
    items: [goodsReceiptItemSchema],
    totalAmount: { type: Number, required: true, min: 0 },
    creatorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true, collection: "goods_receipts", versionKey: false });
goodsReceiptSchema.index({ supplierId: 1 });
goodsReceiptSchema.index({ creatorId: 1 });
const GoodsReceipt = mongoose.model("GoodsReceipt", goodsReceiptSchema);
export default GoodsReceipt;
