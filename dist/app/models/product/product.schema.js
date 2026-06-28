import mongoose, { Schema } from "mongoose";
const productSchema = new Schema({
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
}, { timestamps: true, collection: "products", versionKey: false });
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
const Product = mongoose.model("Product", productSchema);
export default Product;
