import mongoose, { Document, Schema, Types } from "mongoose";

export interface IProduct {
  name: string;
  slug: string;
  brandId: Types.ObjectId;
  description: string;
  imageUrl: string;
  imageUrls: string[];
  categoryId: Types.ObjectId;    // PRIMARY category (breadcrumb, SEO)
  categoryIds: Types.ObjectId[]; // SECONDARY categories (filter, cross-sell) — Magento/BigCommerce pattern
  isActive: boolean;
  averageRating: number;
  numReviews: number;
  soldCount: number;
}

export type ProductDocument = Document & IProduct;

const productSchema = new Schema<ProductDocument>(
  {
    name:          { type: String, required: true, trim: true },
    slug:          { type: String, required: true, trim: true, lowercase: true, index: true },
    brandId:       { type: Schema.Types.ObjectId, ref: "Brand", required: true },
    description:   { type: String, trim: true, default: "" },
    imageUrl:      { type: String, trim: true, default: "" },
    imageUrls:     { type: [String], default: [] },
    categoryId:    { type: Schema.Types.ObjectId, ref: "Category", required: true, index: true },  // primary
    categoryIds:   { type: [Schema.Types.ObjectId], ref: "Category", default: [] },   // secondary N:M
    isActive:      { type: Boolean, default: true, index: true },
    averageRating: { type: Number, default: 0 },
    numReviews:    { type: Number, default: 0 },
    soldCount:     { type: Number, default: 0 },
  },
  { timestamps: true, collection: "products", versionKey: false }
);

productSchema.index({ categoryId: 1, slug: 1 }, { unique: true });

const Product = mongoose.model<ProductDocument>("Product", productSchema);

export default Product;
