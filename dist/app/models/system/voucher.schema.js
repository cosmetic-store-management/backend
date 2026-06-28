import mongoose, { Schema } from "mongoose";
const voucherSchema = new Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true,
    },
    shopId: { type: Schema.Types.ObjectId, ref: "Shop", default: null }, // Multi-tenant
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
    usedBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
}, { timestamps: true, collection: "vouchers", versionKey: false });
const Voucher = mongoose.model("Voucher", voucherSchema);
export default Voucher;
