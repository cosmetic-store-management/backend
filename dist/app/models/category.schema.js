import mongoose, { Schema } from "mongoose";
const categorySchema = new Schema({
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    description: { type: String, trim: true, default: "" },
    imageUrl: { type: String, trim: true, default: "" },
    iconUrl: { type: String, trim: true, default: "" },
    bannerUrl: { type: String, trim: true, default: "" },
    parentId: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
}, { timestamps: true, collection: "categories" });
categorySchema.index({ parentId: 1 });
const Category = mongoose.model("Category", categorySchema);
export default Category;
