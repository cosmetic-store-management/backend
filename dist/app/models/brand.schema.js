import mongoose, { Schema } from "mongoose";
const brandSchema = new Schema({
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    description: { type: String, trim: true, default: "" },
    imageUrl: { type: String, trim: true, default: "" },
    country: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true },
}, { timestamps: true, collection: "brands", versionKey: false });
const Brand = mongoose.model("Brand", brandSchema);
export default Brand;
