import mongoose, { Schema } from "mongoose";
const variantSchema = new Schema({
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true, trim: true },
    sku: { type: String, required: true, unique: true, trim: true },
    barcode: { type: String, trim: true, default: "" },
    price: { type: Number, required: true, min: 0 },
    discountPrice: { type: Number, min: 0, default: null },
    stock: { type: Number, required: true, min: 0 },
    minStock: { type: Number, default: 10 },
    weight: { type: Number, required: true, default: 200 },
    imageUrl: { type: String, trim: true, default: "" },
    attributes: [{ _id: false, name: String, value: String }],
    isActive: { type: Boolean, default: true },
}, { timestamps: true, collection: "variants", versionKey: false });
variantSchema.index({ productId: 1 });
const Variant = mongoose.model("Variant", variantSchema);
export default Variant;
