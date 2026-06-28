import mongoose, { Schema } from "mongoose";
const flashSaleItemSchema = new Schema({
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: Schema.Types.ObjectId, ref: "Variant", required: true },
    flashPrice: { type: Number, required: true },
    quantityLimit: { type: Number, required: true, min: 1 },
    soldQuantity: { type: Number, default: 0, min: 0 },
}, { _id: false });
const flashSaleSchema = new Schema({
    name: { type: String, required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    items: [flashSaleItemSchema],
}, { timestamps: true });
flashSaleSchema.index({ startTime: 1, endTime: 1, isActive: 1 });
const FlashSale = mongoose.model("FlashSale", flashSaleSchema);
export default FlashSale;
