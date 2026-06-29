import User, {
  type UserDocument,
  type IUser,
} from "../user/models/user.schema.js";
import Otp, { type IOtp } from "./models/otp.schema.js";

export const findByPhone = (phone: string) => User.findOne({ phone });

export const findByEmail = (email: string) => User.findOne({ email });

export const findByIdWithPassword = (id: string) => User.findById(id);

export const findByIdSafe = (id: string) =>
  User.findById(id).select("-password");

// Cần select thêm resetToken + resetTokenExpiry vì schema có select:false
export const findByEmailWithResetToken = (email: string) =>
  User.findOne({ email }).select("+resetToken +resetTokenExpiry");

export const findByPhoneWithResetToken = (phone: string) =>
  User.findOne({ phone }).select("+resetToken +resetTokenExpiry");

export const findByResetToken = (token: string) =>
  User.findOne({ resetToken: token }).select("+resetToken +resetTokenExpiry");

export const create = (data: Partial<IUser>) => User.create(data);

export const save = (user: UserDocument) => user.save();

// Cần select thêm refreshTokens vì schema có select:false
export const findByIdWithRefreshToken = (id: string) =>
  User.findById(id).select("+refreshTokens");

export const findOtpByEmail = (email: string) => Otp.findOne({ email });

export const upsertOtp = (email: string, otpCode: string, expiresAt: Date) =>
  Otp.findOneAndUpdate(
    { email },
    { otpCode, expiresAt, isVerified: false },
    { upsert: true, returnDocument: "after" }
  );

export const markOtpVerified = (email: string) =>
  Otp.findOneAndUpdate({ email }, { isVerified: true }, { returnDocument: "after" });

export const deleteOtp = (email: string) => Otp.deleteOne({ email });
