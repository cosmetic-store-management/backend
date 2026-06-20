import mongoose, { Schema } from "mongoose";
const reviewSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", default: null }, // Multi-tenant
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, default: "" },
    images: { type: [String], default: [] },
    adminReply: { type: String, trim: true, default: "" },
    isVerifiedPurchase: { type: Boolean, default: false },
}, { timestamps: true, collection: "reviews" });
// Optimize query for getting reviews of a product
reviewSchema.index({ productId: 1, createdAt: -1 });
// Prevent multiple reviews from same user for same product
reviewSchema.index({ userId: 1, productId: 1 }, { unique: true });
export default mongoose.model("Review", reviewSchema);
