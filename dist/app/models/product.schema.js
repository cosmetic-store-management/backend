import mongoose, { Schema } from "mongoose";
const productSchema = new Schema({
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true, index: true },
    brandId: { type: Schema.Types.ObjectId, ref: "Brand", required: true },
    description: { type: String, trim: true, default: "" },
    imageUrl: { type: String, trim: true, default: "" },
    imageUrls: { type: [String], default: [] },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", required: true, index: true }, // primary
    categoryIds: { type: [Schema.Types.ObjectId], ref: "Category", default: [] }, // secondary N:M
    isActive: { type: Boolean, default: true, index: true },
    averageRating: { type: Number, default: 0 },
    numReviews: { type: Number, default: 0 },
    soldCount: { type: Number, default: 0 },
}, { timestamps: true, collection: "products", versionKey: false });
productSchema.index({ categoryId: 1, slug: 1 }, { unique: true });
const Product = mongoose.model("Product", productSchema);
export default Product;
