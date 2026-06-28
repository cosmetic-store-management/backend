import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import * as authRepo from "./auth.repository.js";
import { mapUser } from "../user/dto/user.response.dto.js";
import {
  unauthorized,
  notFound,
  badRequest,
  conflict,
} from "../../shared/errors/httpErrors.js";
import { 
  sendResetPasswordEmail, 
  sendOtpVerificationEmail,
  sendWelcomeEmail
} from "../../shared/email/email.service.js";
import type { UserDocument } from "../../models/user/user.schema.js";
import type {
  RegisterInput,
  LoginInput,
  ChangePasswordInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  SendOtpInput,
  VerifyOtpInput,
} from "./dto/auth.request.dto.js";

// ── Token config ───────────────────────────────────────────────────────────────
const BCRYPT_ROUNDS = 12;
const RESET_TOKEN_TTL = 60 * 60 * 1000; // 1 giờ (phù hợp với thông báo trong email)
const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 phút
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "30d";

// ── Token generators ──────────────────────────────────────────────────────────
// QUAN TRỌNG: Đọc process.env tại runtime (không lưu module-scope constant)
// vì ESM hoisting có thể load module trước khi dotenv.config() chạy xong.

const getAccessSecret = () => process.env.JWT_SECRET!;
const getRefreshSecret = () =>
  process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET! + "_refresh";

const generateAccessToken = (user: UserDocument): string =>
  jwt.sign(
    { id: user._id, role: user.role },
    getAccessSecret(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { expiresIn: ACCESS_TOKEN_EXPIRY as any },
  );

const generateRefreshToken = (user: UserDocument): string =>
  jwt.sign(
    { id: user._id },
    getRefreshSecret(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { expiresIn: REFRESH_TOKEN_EXPIRY as any },
  );

// ── Auth core ─────────────────────────────────────────────────────────────────

export const generateTokensForOAuth = async (user: UserDocument) => {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  user.refreshTokens = user.refreshTokens || [];
  user.refreshTokens.push(refreshToken);
  if (user.refreshTokens.length > 5) user.refreshTokens.shift();
  await authRepo.save(user);

  return { accessToken, refreshToken };
};

export const sendOtp = async (data: SendOtpInput) => {
  // Sinh mã OTP ngẫu nhiên 6 số
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  // Hạn 5 phút
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

  await authRepo.upsertOtp(data.email, otpCode, expiresAt);

  // In ra console để dev dễ test trong lúc chưa có domain thật
  console.log(`\n================================`);
  console.log(`🚀 [DEV MODE] MÃ OTP CỦA BẠN LÀ: ${otpCode}`);
  console.log(`📧 Gửi cho email: ${data.email}`);
  console.log(`================================\n`);

  // Gửi OTP qua Email thay vì SMS
  sendOtpVerificationEmail(data.email, otpCode).catch((err) => {
    console.error("Failed to send OTP email", err);
  });

  return { message: "Mã OTP đã được gửi đến email của bạn." };
};

export const verifyOtp = async (data: VerifyOtpInput) => {
  const otpRecord = await authRepo.findOtpByEmail(data.email);
  if (!otpRecord) throw notFound("Không tìm thấy yêu cầu gửi OTP cho email này");
  
  if (otpRecord.otpCode !== data.otpCode) {
    throw badRequest("Mã OTP không chính xác");
  }

  if (new Date() > otpRecord.expiresAt) {
    throw badRequest("Mã OTP đã hết hạn");
  }

  await authRepo.markOtpVerified(data.email);
  return { message: "Xác thực email thành công." };
};

export const register = async (data: RegisterInput) => {

  const existing = await authRepo.findByPhone(data.phone);

  // If user exists AND already has a password, it's a real duplicate.
  if (existing && existing.password) {
    throw conflict("Số điện thoại đã được đăng ký. Vui lòng đăng nhập.");
  }

  if (data.email) {
    const existingEmail = await authRepo.findByEmail(data.email);
    // Ensure we don't conflict with our own POS account if it somehow had the same email
    if (
      existingEmail &&
      (!existing || existingEmail._id.toString() !== existing._id.toString())
    ) {
      throw conflict("Email đã tồn tại");
    }
  }

  const hashedPassword = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
  let user;

  if (existing && !existing.password) {
    // Merge scenario: The account was created at POS. Update it with new info.
    existing.name = data.name;
    existing.password = hashedPassword;
    if (data.email) existing.email = data.email;

    await authRepo.save(existing);
    user = existing;
  } else {
    // Normal scenario: Create a brand new account
    user = await authRepo.create({
      ...data,
      password: hashedPassword,
      role: "customer",
    });
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Lưu refresh token vào DB (thêm vào mảng, giữ tối đa 5 thiết bị)
  user.refreshTokens = user.refreshTokens || [];
  user.refreshTokens.push(refreshToken);
  if (user.refreshTokens.length > 5) user.refreshTokens.shift();
  await authRepo.save(user);

  // Gửi email chào mừng ngầm (không await)
  if (data.email) {
    sendWelcomeEmail(data.email, user.name).catch((err) => {
      console.error("Failed to send welcome email:", err);
    });
  }

  return { user: mapUser(user), accessToken, refreshToken };
};

export const loginAdmin = async (data: LoginInput) => {
  const user = data.email
    ? await authRepo.findByEmail(data.email)
    : await authRepo.findByPhone(data.phone!);

  if (!user) throw unauthorized("Tài khoản hoặc mật khẩu không đúng");
  if (!user.password) throw unauthorized("Tài khoản chưa có mật khẩu");

  if (!["owner", "manager", "staff"].includes(user.role)) {
    throw unauthorized("Tài khoản không có quyền truy cập trang quản trị");
  }

  if (user.isActive === false) {
    throw unauthorized(
      "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Quản lý.",
    );
  }

  const isValid = await bcrypt.compare(data.password, user.password);
  if (!isValid) throw unauthorized("Số điện thoại hoặc mật khẩu không đúng");

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Lưu refresh token vào DB
  const userWithToken = await authRepo.findByIdWithRefreshToken(
    user._id.toString(),
  );
  if (userWithToken) {
    userWithToken.refreshTokens = userWithToken.refreshTokens || [];
    userWithToken.refreshTokens.push(refreshToken);
    if (userWithToken.refreshTokens.length > 5) userWithToken.refreshTokens.shift();
    await authRepo.save(userWithToken);
  }

  return { user: mapUser(user), accessToken, refreshToken };
};

export const loginPublic = async (data: LoginInput) => {
  if (!data.phone && !data.email) throw unauthorized("Vui lòng nhập email hoặc số điện thoại");
  
  const user = data.email
    ? await authRepo.findByEmail(data.email)
    : await authRepo.findByPhone(data.phone!);
    
  if (!user) throw unauthorized("Số điện thoại, email hoặc mật khẩu không đúng");

  if (!user.password) {
    throw unauthorized(
      "Tài khoản của bạn được tạo tại Cửa hàng nhưng chưa có mật khẩu. Vui lòng Đăng ký lại hoặc chọn Quên mật khẩu để sử dụng Web.",
    );
  }

  if (user.role !== "customer") {
    throw unauthorized("Tài khoản quản trị không thể đăng nhập tại đây");
  }

  if (user.isActive === false) {
    throw unauthorized("Tài khoản của bạn đã bị khóa.");
  }

  const isValid = await bcrypt.compare(data.password, user.password);
  if (!isValid) throw unauthorized("Số điện thoại hoặc mật khẩu không đúng");

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Lưu refresh token vào DB
  const userWithToken = await authRepo.findByIdWithRefreshToken(
    user._id.toString(),
  );
  if (userWithToken) {
    userWithToken.refreshTokens = userWithToken.refreshTokens || [];
    userWithToken.refreshTokens.push(refreshToken);
    if (userWithToken.refreshTokens.length > 5) userWithToken.refreshTokens.shift();
    await authRepo.save(userWithToken);
  }

  return { user: mapUser(user), accessToken, refreshToken };
};

export const getCurrentUser = (user: UserDocument) => mapUser(user);

export const changePassword = async (
  userId: string,
  data: ChangePasswordInput,
) => {
  const user = await authRepo.findByIdWithPassword(userId);
  if (!user) throw notFound("Người dùng không tồn tại");
  if (!user.password) throw badRequest("Tài khoản này chưa có mật khẩu");

  const isValid = await bcrypt.compare(data.currentPassword, user.password);
  if (!isValid) throw badRequest("Mật khẩu hiện tại không đúng");

  user.password = await bcrypt.hash(data.newPassword, BCRYPT_ROUNDS);
  user.refreshTokens = []; // invalidate tất cả session khi đổi mật khẩu
  await authRepo.save(user);
};

// ── Refresh Token ─────────────────────────────────────────────────────────────

export const refreshAccessToken = async (refreshToken: string) => {
  // [1] Verify JWT
  let payload: { id: string };
  try {
    payload = jwt.verify(refreshToken, getRefreshSecret()) as { id: string };
  } catch {
    throw unauthorized("Refresh token không hợp lệ hoặc đã hết hạn");
  }

  // [2] Tìm user và kiểm tra refresh token có khớp trong DB không
  const user = await authRepo.findByIdWithRefreshToken(payload.id);
  if (!user || !user.refreshTokens?.includes(refreshToken)) {
    throw unauthorized("Refresh token không hợp lệ hoặc đã bị thu hồi");
  }

  if (user.isActive === false) {
    throw unauthorized("Tài khoản đã bị khóa");
  }

  // [3] Issue token mới
  // Chú ý: KHÔNG rotate refresh token ở đây để tránh lỗi race condition khi mở nhiều tab.
  // Nếu rotate, Tab 1 đổi refresh token thành công, Tab 2 gửi refresh token cũ sẽ bị lỗi 401 và logout.
  const newAccessToken = generateAccessToken(user);

  return { accessToken: newAccessToken, refreshToken: refreshToken };
};

export const logout = async (userId: string, refreshToken?: string) => {
  const user = await authRepo.findByIdWithRefreshToken(userId);
  if (user && user.refreshTokens) {
    if (refreshToken) {
      user.refreshTokens = user.refreshTokens.filter(t => t !== refreshToken);
    } else {
      user.refreshTokens = []; // Xoá toàn bộ nếu không cung cấp cụ thể
    }
    await authRepo.save(user);
  }
};

// ── Forgot / Reset password ───────────────────────────────────────────────────

export const forgotPassword = async (data: ForgotPasswordInput) => {
  const user = data.email
    ? await authRepo.findByEmailWithResetToken(data.email)
    : await authRepo.findByPhoneWithResetToken(data.phone!);

  // Luôn trả thành công — không tiết lộ email/phone có tồn tại không (security)
  if (!user)
    return {
      message: "Nếu tài khoản tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi",
    };

  // Tạo token ngẫu nhiên 32 bytes
  const resetToken = crypto.randomBytes(32).toString("hex");

  user.resetToken = resetToken;
  user.resetTokenExpiry = new Date(Date.now() + RESET_TOKEN_TTL);
  await authRepo.save(user);

  // Gửi email qua Resend (HTTPS API — hoạt động trên Railway Hobby)
  // Lỗi gửi email được bắt riêng bên trong — không làm fail request này
  if (user.email) {
    await sendResetPasswordEmail(user.email, resetToken);
  }

  return {
    message: "Nếu tài khoản tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi",
  };
};

export const resetPassword = async (data: ResetPasswordInput) => {
  const user = await authRepo.findByResetToken(data.token);

  if (!user || !user.resetTokenExpiry)
    throw badRequest("Token không hợp lệ hoặc đã hết hạn");
  if (user.resetTokenExpiry < new Date())
    throw badRequest("Token đã hết hạn, vui lòng yêu cầu lại");

  user.password = await bcrypt.hash(data.newPassword, BCRYPT_ROUNDS);
  user.resetToken = undefined;
  user.resetTokenExpiry = undefined;
  user.refreshTokens = []; // invalidate tất cả session sau reset password
  await authRepo.save(user);
};
