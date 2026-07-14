import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { injectable, inject } from "tsyringe";
import { AuthRepository } from "./auth.repository.js";
import { mapUser } from "../user/dto/user.response.dto.js";
import { unauthorized, notFound, badRequest, conflict } from "../../../shared/errors/httpErrors.js";
import { sendResetPasswordEmail, sendOtpVerificationEmail, sendWelcomeEmail } from "../../../shared/email/email.service.js";
import type { UserDocument } from "../user/models/user.schema.js";
import type { RegisterInput, LoginInput, ChangePasswordInput, ForgotPasswordInput, ResetPasswordInput, SendOtpInput, VerifyOtpInput } from "./dto/auth.request.dto.js";
import { logger } from "../../../shared/logger/index.js";

@injectable()
export class AuthService {
  private readonly BCRYPT_ROUNDS = 12;
  private readonly RESET_TOKEN_TTL = 60 * 60 * 1000;
  private readonly OTP_EXPIRY_MS = 5 * 60 * 1000;
  private readonly ACCESS_TOKEN_EXPIRY = "15m";
  private readonly REFRESH_TOKEN_EXPIRY = "30d";

  constructor(
    @inject(AuthRepository) private readonly authRepo: AuthRepository
  ) {}

  private getAccessSecret(): string { return process.env.JWT_SECRET!; }
  private getRefreshSecret(): string { return process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET! + "_refresh"; }

  private generateAccessToken(user: UserDocument): string {
    return jwt.sign(
      { id: user._id, role: user.role },
      this.getAccessSecret(),
      { expiresIn: this.ACCESS_TOKEN_EXPIRY as any }
    );
  }

  private generateRefreshToken(user: UserDocument): string {
    return jwt.sign(
      { id: user._id },
      this.getRefreshSecret(),
      { expiresIn: this.REFRESH_TOKEN_EXPIRY as any }
    );
  }

  async generateTokensForOAuth(user: UserDocument) {
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);

    user.refreshTokens = user.refreshTokens || [];
    user.refreshTokens.push(refreshToken);
    if (user.refreshTokens.length > 5) user.refreshTokens.shift();
    await this.authRepo.save(user);

    return { accessToken, refreshToken };
  }

  async sendOtp(data: SendOtpInput) {
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_MS);
    await this.authRepo.upsertOtp(data.email, otpCode, expiresAt);
    logger.info(`\n================================\n🚀 [DEV MODE] MÃ OTP CỦA BẠN LÀ: ${otpCode}\n📧 Gửi cho email: ${data.email}\n================================\n`);
    sendOtpVerificationEmail(data.email, otpCode).catch((err) => { logger.error("Failed to send OTP email", err); });
    return { message: "OTP code has been sent to your email." };
  }

  async verifyOtp(data: VerifyOtpInput) {
    const otpRecord = await this.authRepo.findOtpByEmail(data.email);
    if (!otpRecord) throw notFound("No OTP request found for this email");
    if (otpRecord.attempts >= 5) {
      await this.authRepo.deleteOtp(data.email);
      throw badRequest("OTP has been cancelled due to too many failed attempts. Please request a new one.");
    }
    if (otpRecord.otpCode !== data.otpCode) {
      const updatedRecord = await this.authRepo.incrementOtpAttempts(data.email);
      const currentAttempts = updatedRecord?.attempts ?? (otpRecord.attempts + 1);
      if (currentAttempts >= 5) {
        await this.authRepo.deleteOtp(data.email);
        throw badRequest("OTP has been cancelled due to too many failed attempts. Please request a new one.");
      }
      throw badRequest(`Mã OTP không chính xác. Bạn còn ${5 - currentAttempts} lần thử.`);
    }
    if (new Date() > otpRecord.expiresAt) throw badRequest("OTP code has expired");
    await this.authRepo.markOtpVerified(data.email);
    return { message: "Email verified successfully." };
  }

  async register(data: RegisterInput) {
    const existing = await this.authRepo.findByPhone(data.phone);
    if (existing && existing.password) throw conflict("Phone number is already registered. Please log in.");
    if (data.email) {
      const existingEmail = await this.authRepo.findByEmail(data.email);
      if (existingEmail && (!existing || existingEmail._id.toString() !== existing._id.toString())) {
        throw conflict("Email already exists");
      }
    }
    const hashedPassword = await bcrypt.hash(data.password, this.BCRYPT_ROUNDS);
    let user;
    if (existing && !existing.password) {
      existing.name = data.name;
      existing.password = hashedPassword;
      if (data.email) existing.email = data.email;
      await this.authRepo.save(existing);
      user = existing;
    } else {
      user = await this.authRepo.create({ ...data, password: hashedPassword, role: "customer" });
    }
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);
    user.refreshTokens = user.refreshTokens || [];
    user.refreshTokens.push(refreshToken);
    if (user.refreshTokens.length > 5) user.refreshTokens.shift();
    await this.authRepo.save(user);
    if (data.email) {
      sendWelcomeEmail(data.email, user.name).catch((err) => logger.error("Failed to send welcome email:", err));
    }
    return { user: mapUser(user), accessToken, refreshToken };
  }

  async login(data: LoginInput) {
    if (!data.phone && !data.email) throw unauthorized("Please enter email or phone number");
    const user = data.email ? await this.authRepo.findByEmail(data.email) : await this.authRepo.findByPhone(data.phone!);
    if (!user) throw unauthorized("Incorrect phone number, email, or password");
    if (data.email && !["owner", "manager", "staff"].includes(user.role)) throw unauthorized("Incorrect phone number, email, or password");
    if (data.phone && user.role !== "customer") throw unauthorized("Incorrect phone number, email, or password");
    if (!user.password) throw unauthorized("Your account does not have a password. Please Register again or choose Forgot Password to use the Web.");
    if (user.isActive === false) throw unauthorized("Your account has been locked. Please contact the Manager.");
    const isValid = await bcrypt.compare(data.password, user.password);
    if (!isValid) throw unauthorized("Incorrect phone number or password");
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);
    const userWithToken = await this.authRepo.findByIdWithRefreshToken(user._id.toString());
    if (userWithToken) {
      userWithToken.refreshTokens = userWithToken.refreshTokens || [];
      userWithToken.refreshTokens.push(refreshToken);
      if (userWithToken.refreshTokens.length > 5) userWithToken.refreshTokens.shift();
      await this.authRepo.save(userWithToken);
    }
    return { user: mapUser(user), accessToken, refreshToken };
  }

  getCurrentUser(user: UserDocument) { return mapUser(user); }

  async changePassword(userId: string, data: ChangePasswordInput) {
    const user = await this.authRepo.findByIdWithPassword(userId);
    if (!user) throw notFound("User does not exist");
    if (!user.password) throw badRequest("This account does not have a password");
    const isValid = await bcrypt.compare(data.currentPassword, user.password);
    if (!isValid) throw badRequest("Current password is incorrect");
    user.password = await bcrypt.hash(data.newPassword, this.BCRYPT_ROUNDS);
    user.refreshTokens = [];
    await this.authRepo.save(user);
  }

  async refreshAccessToken(refreshToken: string) {
    let payload: { id: string };
    try {
      payload = jwt.verify(refreshToken, this.getRefreshSecret()) as { id: string };
    } catch {
      throw unauthorized("Invalid or expired refresh token");
    }
    const user = await this.authRepo.findByIdWithRefreshToken(payload.id);
    if (!user || !user.refreshTokens?.includes(refreshToken)) throw unauthorized("Invalid or revoked refresh token");
    if (user.isActive === false) throw unauthorized("Account has been locked");
    const newAccessToken = this.generateAccessToken(user);
    return { accessToken: newAccessToken, refreshToken: refreshToken };
  }

  async logout(userId: string, refreshToken?: string) {
    const user = await this.authRepo.findByIdWithRefreshToken(userId);
    if (user && user.refreshTokens) {
      if (refreshToken) user.refreshTokens = user.refreshTokens.filter(t => t !== refreshToken);
      else user.refreshTokens = [];
      await this.authRepo.save(user);
    }
  }

  async forgotPassword(data: ForgotPasswordInput) {
    const user = data.email ? await this.authRepo.findByEmailWithResetToken(data.email) : await this.authRepo.findByPhoneWithResetToken(data.phone!);
    if (!user) return { message: "If the account exists, password reset instructions have been sent" };
    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetToken = resetToken;
    user.resetTokenExpiry = new Date(Date.now() + this.RESET_TOKEN_TTL);
    await this.authRepo.save(user);
    if (user.email) await sendResetPasswordEmail(user.email, resetToken);
    return { message: "If the account exists, password reset instructions have been sent" };
  }

  async resetPassword(data: ResetPasswordInput) {
    const user = await this.authRepo.findByResetToken(data.token);
    if (!user || !user.resetTokenExpiry) throw badRequest("Invalid or expired token");
    if (user.resetTokenExpiry < new Date()) throw badRequest("Token has expired, please request again");
    user.password = await bcrypt.hash(data.newPassword, this.BCRYPT_ROUNDS);
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    user.refreshTokens = [];
    await this.authRepo.save(user);
  }
}
