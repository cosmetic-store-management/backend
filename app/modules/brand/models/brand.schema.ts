import mongoose, { Document, Schema } from "mongoose";

export interface IBrand {
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
  country: string;
  isActive: boolean;
}

export type BrandDocument = Document & IBrand;

const brandSchema = new Schema<BrandDocument>(
  {
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    description: { type: String, trim: true, default: "" },
    imageUrl: { type: String, trim: true, default: "" },
    country: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "brands", versionKey: false },
);

const Brand = mongoose.model<BrandDocument>("Brand", brandSchema);

export default Brand;
