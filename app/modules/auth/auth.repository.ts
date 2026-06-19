import User, { type UserDocument, type IUser } from "../../models/user.schema.js";

export const findByPhone = (phone: string) =>
  User.findOne({ phone });

export const findByEmail = (email: string) =>
  User.findOne({ email });

export const findByIdWithPassword = (id: string) =>
  User.findById(id);

export const findByIdSafe = (id: string) =>
  User.findById(id).select("-password");

// Cần select thêm resetToken + resetTokenExpiry vì schema có select:false
export const findByEmailWithResetToken = (email: string) =>
  User.findOne({ email }).select("+resetToken +resetTokenExpiry");

export const findByPhoneWithResetToken = (phone: string) =>
  User.findOne({ phone }).select("+resetToken +resetTokenExpiry");

export const findByResetToken = (token: string) =>
  User.findOne({ resetToken: token }).select("+resetToken +resetTokenExpiry");

export const create = (data: Partial<IUser>) =>
  User.create(data);

export const save = (user: UserDocument) =>
  user.save();

// Cần select thêm refreshToken vì schema có select:false
export const findByIdWithRefreshToken = (id: string) =>
  User.findById(id).select("+refreshToken");
