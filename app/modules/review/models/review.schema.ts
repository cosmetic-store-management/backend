import mongoose, { Document, Schema, Types } from "mongoose";

export interface IReview {
  userId: Types.ObjectId;
  productId: Types.ObjectId;
  rating: number; // 1 to 5
  comment: string;
  images?: string[];
  videos?: string[];
  adminReply?: string;
  isVerifiedPurchase: boolean;
}

export type ReviewDocument = Document & IReview;

const reviewSchema = new Schema<ReviewDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, default: "" },
    images: { type: [String], default: [] },
    videos: { type: [String], default: [] },
    adminReply: { type: String, trim: true, default: "" },
    isVerifiedPurchase: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "reviews" },
);

// Optimize query for getting reviews of a product
reviewSchema.index({ productId: 1, createdAt: -1 });

// Prevent multiple reviews from same user for same product
reviewSchema.index({ userId: 1, productId: 1 }, { unique: true });

export default mongoose.model<ReviewDocument>("Review", reviewSchema);
