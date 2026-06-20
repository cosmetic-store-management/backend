import mongoose, { Schema } from "mongoose";
export const PERMISSIONS = [
    "orders.view", "orders.manage", // Đơn hàng & Đóng gói
    "pos.access", // Bán hàng tại quầy (POS)
    "products.view", "products.manage", // Sản phẩm & Tồn kho
    "customers.view", "customers.manage", // CRM Khách hàng
    "vouchers.view", "vouchers.manage", // Marketing (Mã giảm giá, Banner)
    "reports.view", // Báo cáo & Thống kê
    "reviews.manage" // Đánh giá sản phẩm
];
const addressSchema = new Schema({
    province: { type: String, required: true, trim: true },
    district: { type: String, required: true, trim: true },
    ward: { type: String, required: true, trim: true },
    street: { type: String, required: true, trim: true },
    isDefault: { type: Boolean, default: false }
});
const userSchema = new Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, unique: true, sparse: true, trim: true, lowercase: true },
    phone: { type: String, required: true, unique: true, trim: true },
    password: { type: String, minlength: 6 },
    addresses: { type: [addressSchema], default: [] },
    role: { type: String, enum: ["owner", "manager", "staff", "customer"], default: "customer" },
    permissions: { type: [String], enum: PERMISSIONS, default: [] },
    isActive: { type: Boolean, default: true },
    points: { type: Number, default: 0, min: 0 },
    internalNotes: { type: String, default: "" },
    resetToken: { type: String, select: false },
    resetTokenExpiry: { type: Date, select: false },
    refreshToken: { type: String, select: false }, // stored for revocation check
    dob: { type: Date },
    gender: { type: String, enum: ["male", "female", "other"] },
    favorites: [{ type: Schema.Types.ObjectId, ref: "Product" }],
    recentlyViewed: [{ type: Schema.Types.ObjectId, ref: "Product" }],
    savedVouchers: [{ type: Schema.Types.ObjectId, ref: "Voucher" }],
    avatar: { type: String },
}, { timestamps: true, collection: "users" });
const User = mongoose.model("User", userSchema);
export default User;
