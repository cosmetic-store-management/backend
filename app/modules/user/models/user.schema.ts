import mongoose, { Document, Schema } from "mongoose";

export type UserRole = "owner" | "manager" | "staff" | "customer";

export const PERMISSIONS = [
  "orders.view",
  "orders.manage", // Đơn hàng & Đóng gói
  "pos.access", // Bán hàng tại quầy (POS)
  "products.view",
  "products.manage", // Sản phẩm & Tồn kho
  "customers.view",
  "customers.manage", // CRM Khách hàng
  "vouchers.view",
  "vouchers.manage", // Marketing (Mã giảm giá, Banner)
  "reports.view", // Báo cáo & Thống kê
  "reviews.manage", // Đánh giá sản phẩm
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export interface IAddress {
  _id?: mongoose.Types.ObjectId;
  province: string;
  district: string;
  ward: string;
  street: string;
  isDefault: boolean;
}

export interface IOAuthProvider {
  provider: "google" | "facebook";
  providerId: string;
}

export interface IUser {
  name: string;
  email?: string;
  phone?: string;
  password?: string;
  providers: IOAuthProvider[];
  addresses: IAddress[];
  role: UserRole;
  isActive: boolean;
  points: number;
  permissions: Permission[];
  internalNotes?: string;
  resetToken?: string;
  resetTokenExpiry?: Date;
  refreshTokens?: string[];
  dob?: Date;
  gender?: "male" | "female" | "other";
  citizenId?: string;
  startDate?: Date;
  bankInfo?: {
    bankName?: string;
    accountNumber?: string;
    accountName?: string;
  };
  emergencyContact?: {
    name?: string;
    phone?: string;
    relationship?: string;
  };
  homeAddress?: string;
  employeeId?: string;
  status?: "working" | "probation" | "suspended" | "resigned";
  contractType?: "fulltime" | "parttime" | "probationary" | "internship";
  workingShift?: "morning" | "afternoon" | "night" | "full";
  salaryInfo?: {
    baseSalary: number;
    allowance: number;
    commissionRate: number;
  };
  favorites?: mongoose.Types.ObjectId[];
  recentlyViewed?: mongoose.Types.ObjectId[];
  savedVouchers?: mongoose.Types.ObjectId[];
  avatar?: string;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: mongoose.Types.ObjectId;
}

export type UserDocument = Document & IUser;

const addressSchema = new Schema<IAddress>({
  province: { type: String, required: true, trim: true },
  district: { type: String, required: true, trim: true },
  ward: { type: String, required: true, trim: true },
  street: { type: String, required: true, trim: true },
  isDefault: { type: Boolean, default: false },
});

const userSchema = new Schema<UserDocument>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
    },
    phone: { type: String, unique: true, sparse: true, trim: true },
    password: { type: String, minlength: 6 },
    providers: {
      type: [
        {
          provider: { type: String, enum: ["google", "facebook"], required: true },
          providerId: { type: String, required: true },
        },
      ],
      default: [],
    },
    addresses: { type: [addressSchema], default: [] },
    role: {
      type: String,
      enum: ["owner", "manager", "staff", "customer"],
      default: "customer",
    },
    permissions: { type: [String], enum: PERMISSIONS, default: [] },
    isActive: { type: Boolean, default: true },
    points: { type: Number, default: 0, min: 0 },
    internalNotes: { type: String, default: "" },
    resetToken: { type: String, select: false },
    resetTokenExpiry: { type: Date, select: false },
    refreshTokens: { type: [String], select: false, default: [] }, // stored for revocation check
    dob: { type: Date },
    gender: { type: String, enum: ["male", "female", "other"] },
    citizenId: { type: String, unique: true, sparse: true, trim: true },
    startDate: { type: Date },
    bankInfo: {
      bankName: { type: String, trim: true },
      accountNumber: { type: String, trim: true },
      accountName: { type: String, trim: true },
    },
    emergencyContact: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
      relationship: { type: String, trim: true },
    },
    homeAddress: { type: String, trim: true },
    employeeId: { type: String, unique: true, sparse: true, trim: true },
    status: {
      type: String,
      enum: ["working", "probation", "suspended", "resigned"],
      default: "working",
    },
    contractType: {
      type: String,
      enum: ["fulltime", "parttime", "probationary", "internship"],
      default: "fulltime",
    },
    workingShift: {
      type: String,
      enum: ["morning", "afternoon", "night", "full"],
      default: "full",
    },
    salaryInfo: {
      baseSalary: { type: Number, default: 0 },
      allowance: { type: Number, default: 0 },
      commissionRate: { type: Number, default: 0 },
    },
    favorites: [{ type: Schema.Types.ObjectId, ref: "Product" }],
    recentlyViewed: [{ type: Schema.Types.ObjectId, ref: "Product" }],
    savedVouchers: [{ type: Schema.Types.ObjectId, ref: "Voucher" }],
    avatar: { type: String },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true, collection: "users" },
);

const User = mongoose.model<UserDocument>("User", userSchema);

export default User;
