import { injectable } from "tsyringe";
import User, { type UserDocument, type IUser } from "../user/models/user.schema.js";
import Otp, { type IOtp } from "./models/otp.schema.js";

@injectable()
export class AuthRepository {
  findByPhone(phone: string) { return User.findOne({ phone }); }
  findByEmail(email: string) { return User.findOne({ email }); }
  findByIdWithPassword(id: string) { return User.findById(id); }
  findByIdSafe(id: string) { return User.findById(id).select("-password"); }
  findByEmailWithResetToken(email: string) { return User.findOne({ email }).select("+resetToken +resetTokenExpiry"); }
  findByPhoneWithResetToken(phone: string) { return User.findOne({ phone }).select("+resetToken +resetTokenExpiry"); }
  findByResetToken(token: string) { return User.findOne({ resetToken: token }).select("+resetToken +resetTokenExpiry"); }
  create(data: Partial<IUser>) { return User.create(data); }
  save(user: UserDocument) { return user.save(); }
  findByIdWithRefreshToken(id: string) { return User.findById(id).select("+refreshTokens"); }
  findOtpByEmail(email: string) { return Otp.findOne({ email }); }
  upsertOtp(email: string, otpCode: string, expiresAt: Date) {
    return Otp.findOneAndUpdate(
      { email },
      { otpCode, expiresAt, isVerified: false, attempts: 0 },
      { upsert: true, returnDocument: "after" }
    );
  }
  markOtpVerified(email: string) { return Otp.findOneAndUpdate({ email }, { isVerified: true }, { returnDocument: "after" }); }
  deleteOtp(email: string) { return Otp.deleteOne({ email }); }
  incrementOtpAttempts(email: string) { return Otp.findOneAndUpdate({ email }, { $inc: { attempts: 1 } }, { returnDocument: "after" }); }
}
