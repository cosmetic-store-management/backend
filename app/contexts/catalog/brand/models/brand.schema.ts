import mongoose, { Document, Schema } from "mongoose";

export interface IBrand {
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
  country: string;
  isActive: boolean;
  website?: string;
  contactPhone?: string;
  contactEmail?: string;
  supplierName?: string;
  minimumOrderValue?: number;
  leadTimeDays?: number;
  supplierId?: mongoose.Types.ObjectId | string | null;
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
    website: { type: String, trim: true, default: "" },
    contactPhone: { type: String, trim: true, default: "" },
    contactEmail: { type: String, trim: true, default: "" },
    supplierName: { type: String, trim: true, default: "" },
    minimumOrderValue: { type: Number, default: 0 },
    leadTimeDays: { type: Number, default: 7 },
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", default: null },
  },
  { timestamps: true, collection: "brands", versionKey: false },
);

const Brand = mongoose.model<BrandDocument>("Brand", brandSchema);

export default Brand;
