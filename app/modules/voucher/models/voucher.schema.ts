import mongoose, { Document, Schema } from "mongoose";

export interface IVoucher {
  code: string;
  discountType: "percent" | "fixed" | "freeship";
  discountValue: number;
  minOrderValue: number;
  maxDiscount?: number;
  startDate: Date;
  endDate: Date;
  usageLimit: number;
  usedCount: number;
  isActive: boolean;
  ttlMinutes: number;
  overbookingLimit: number;
  usedBy: mongoose.Types.ObjectId[];
}

export type VoucherDocument = Document & IVoucher;

const voucherSchema = new Schema<VoucherDocument>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    discountType: {
      type: String,
      enum: ["percent", "fixed", "freeship"],
      required: true,
    },
    discountValue: { type: Number, required: true, min: 0 },
    minOrderValue: { type: Number, default: 0, min: 0 },
    maxDiscount: { type: Number, min: 0 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    usageLimit: { type: Number, default: 0, min: 0 }, // 0: unlimited
    usedCount: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
    ttlMinutes: { type: Number, default: 0, min: 0 },
    overbookingLimit: { type: Number, default: 0, min: -1 },
    usedBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true, collection: "vouchers", versionKey: false },
);

const Voucher = mongoose.model<VoucherDocument>("Voucher", voucherSchema);

export default Voucher;
