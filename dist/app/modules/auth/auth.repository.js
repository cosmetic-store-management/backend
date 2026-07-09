import User from "../user/models/user.schema.js";
import Otp from "./models/otp.schema.js";
export const findByPhone = (phone) => User.findOne({ phone });
export const findByEmail = (email) => User.findOne({ email });
export const findByIdWithPassword = (id) => User.findById(id);
export const findByIdSafe = (id) => User.findById(id).select("-password");
// Cần select thêm resetToken + resetTokenExpiry vì schema có select:false
export const findByEmailWithResetToken = (email) => User.findOne({ email }).select("+resetToken +resetTokenExpiry");
export const findByPhoneWithResetToken = (phone) => User.findOne({ phone }).select("+resetToken +resetTokenExpiry");
export const findByResetToken = (token) => User.findOne({ resetToken: token }).select("+resetToken +resetTokenExpiry");
export const create = (data) => User.create(data);
export const save = (user) => user.save();
// Cần select thêm refreshTokens vì schema có select:false
export const findByIdWithRefreshToken = (id) => User.findById(id).select("+refreshTokens");
export const findOtpByEmail = (email) => Otp.findOne({ email });
export const upsertOtp = (email, otpCode, expiresAt) => Otp.findOneAndUpdate({ email }, { otpCode, expiresAt, isVerified: false }, { upsert: true, returnDocument: "after" });
export const markOtpVerified = (email) => Otp.findOneAndUpdate({ email }, { isVerified: true }, { returnDocument: "after" });
export const deleteOtp = (email) => Otp.deleteOne({ email });
