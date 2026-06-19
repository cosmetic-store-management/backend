import mongoose, { Document, Schema } from "mongoose";

export type UserRole = "owner" | "manager" | "staff" | "customer";

export const PERMISSIONS = [
  "orders.view", "orders.manage",     // Đơn hàng & Đóng gói
  "pos.access",                       // Bán hàng tại quầy (POS)
  "products.view", "products.manage", // Sản phẩm & Tồn kho
  "customers.view", "customers.manage",// CRM Khách hàng
  "vouchers.view", "vouchers.manage", // Marketing (Mã giảm giá, Banner)
  "reports.view",                     // Báo cáo & Thống kê
  "reviews.manage"                    // Đánh giá sản phẩm
] as const;

export type Permission = typeof PERMISSIONS[number];

export interface IAddress {
  _id?: mongoose.Types.ObjectId;
  province: string;
  district: string;
  ward: string;
  street: string;
  isDefault: boolean;
}

export interface IUser {
  name: string;
  email?: string;
  phone: string;
  password?: string;
  addresses: IAddress[];
  role: UserRole;
  isActive: boolean;
  points: number;
  permissions: Permission[];
  internalNotes?: string;
  resetToken?:       string;
  resetTokenExpiry?: Date;
  refreshToken?:     string;
  dob?: Date;
  gender?: "male" | "female" | "other";
  favorites?: mongoose.Types.ObjectId[];
  recentlyViewed?: mongoose.Types.ObjectId[];
  savedVouchers?: mongoose.Types.ObjectId[];
  avatar?: string;
}

export type UserDocument = Document & IUser;

const addressSchema = new Schema<IAddress>({
  province: { type: String, required: true, trim: true },
  district: { type: String, required: true, trim: true },
  ward:     { type: String, required: true, trim: true },
  street:   { type: String, required: true, trim: true },
  isDefault:{ type: Boolean, default: false }
});

const userSchema = new Schema<UserDocument>(
  {
    name:              { type: String, required: true, trim: true },
    email:             { type: String, unique: true, sparse: true, trim: true, lowercase: true },
    phone:             { type: String, required: true, unique: true, trim: true },
    password:          { type: String, minlength: 6 },
    addresses:         { type: [addressSchema], default: [] },
    role:              { type: String, enum: ["owner", "manager", "staff", "customer"], default: "customer" },
    permissions:       { type: [String], enum: PERMISSIONS, default: [] },
    isActive:          { type: Boolean, default: true },
    points:            { type: Number, default: 0, min: 0 },
    internalNotes:     { type: String, default: "" },
    resetToken:        { type: String, select: false },
    resetTokenExpiry:  { type: Date,   select: false },
    refreshToken:      { type: String, select: false },  // stored for revocation check
    dob:               { type: Date },
    gender:            { type: String, enum: ["male", "female", "other"] },
    favorites:         [{ type: Schema.Types.ObjectId, ref: "Product" }],
    recentlyViewed:    [{ type: Schema.Types.ObjectId, ref: "Product" }],
    savedVouchers:     [{ type: Schema.Types.ObjectId, ref: "Voucher" }],
    avatar:            { type: String },
  },
  { timestamps: true, collection: "users" }
);

const User = mongoose.model<UserDocument>("User", userSchema);

export default User;
