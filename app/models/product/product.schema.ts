import mongoose, { Document, Schema, Types } from "mongoose";

export interface IProduct {
  name: string;
  slug: string;
  brandId: Types.ObjectId;
  description: string;
  imageUrl: string;
  imageUrls: string[];
  categoryId: Types.ObjectId; // PRIMARY category (breadcrumb, SEO)
  categoryIds: Types.ObjectId[]; // SECONDARY categories (filter, cross-sell) — Magento/BigCommerce pattern
  isActive: boolean;
  averageRating: number;
  numReviews: number;
  soldCount: number;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
}

export type ProductDocument = Document & IProduct;

const productSchema = new Schema<ProductDocument>(
  {
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    brandId: { type: Schema.Types.ObjectId, ref: "Brand", required: true },
    description: { type: String, trim: true, default: "" },
    imageUrl: { type: String, trim: true, default: "" },
    imageUrls: { type: [String], default: [] },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    }, // primary
    categoryIds: {
      type: [Schema.Types.ObjectId],
      ref: "Category",
      default: [],
    }, // secondary N:M
    isActive: { type: Boolean, default: true, index: true },
    averageRating: { type: Number, default: 0 },
    numReviews: { type: Number, default: 0 },
    soldCount: { type: Number, default: 0 },
    metaTitle: { type: String, trim: true, default: "" },
    metaDescription: { type: String, trim: true, default: "" },
    metaKeywords: { type: String, trim: true, default: "" },
  },
  { timestamps: true, collection: "products", versionKey: false },
);

// ── Indexes ───────────────────────────────────────────────────────────────────
// Slug unique per category (query by slug chính)
productSchema.index({ categoryId: 1, slug: 1 }, { unique: true });
// Catalog: filter isActive + sort mới nhất (default homepage sort)
productSchema.index({ isActive: 1, createdAt: -1 });
// Catalog: filter isActive + category + sort bán chạy
productSchema.index({ isActive: 1, categoryId: 1, soldCount: -1 });
// Catalog: filter theo brand
productSchema.index({ isActive: 1, brandId: 1, soldCount: -1 });
// Catalog: sắp xếp theo đánh giá
productSchema.index({ isActive: 1, averageRating: -1 });
// Secondary categories (cross-sell filter)
productSchema.index({ categoryIds: 1, isActive: 1 });
// Text search: tìm kiếm sản phẩm theo tên
productSchema.index({ name: "text" }, { default_language: "none" });

const Product = mongoose.model<ProductDocument>("Product", productSchema);

export default Product;
