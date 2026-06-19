import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import * as authRepo from "./auth.repository.js";
import { mapUser } from "../user/dto/user.response.dto.js";
import { unauthorized, notFound, badRequest, conflict } from "../../shared/errors/httpErrors.js";
import { sendResetPasswordEmail } from "../../shared/email/email.service.js";
import type { UserDocument } from "../../models/user.schema.js";
import type { RegisterInput, LoginInput, ChangePasswordInput, ForgotPasswordInput, ResetPasswordInput } from "./dto/auth.request.dto.js";

// ── Token config ───────────────────────────────────────────────────────────────
const BCRYPT_ROUNDS        = 12;
const RESET_TOKEN_TTL      = 60 * 60 * 1000; // 1 giờ (phù hợp với thông báo trong email)
const ACCESS_TOKEN_EXPIRY  = "15m";
const REFRESH_TOKEN_EXPIRY = "30d";

// ── Token generators ──────────────────────────────────────────────────────────
// QUAN TRỌNG: Đọc process.env tại runtime (không lưu module-scope constant)
// vì ESM hoisting có thể load module trước khi dotenv.config() chạy xong.

const getAccessSecret  = () => process.env.JWT_SECRET!;
const getRefreshSecret = () => process.env.JWT_REFRESH_SECRET || (process.env.JWT_SECRET! + "_refresh");

const generateAccessToken = (user: UserDocument): string =>
  jwt.sign(
    { id: user._id, role: user.role },
    getAccessSecret(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { expiresIn: ACCESS_TOKEN_EXPIRY as any }
  );

const generateRefreshToken = (user: UserDocument): string =>
  jwt.sign(
    { id: user._id },
    getRefreshSecret(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { expiresIn: REFRESH_TOKEN_EXPIRY as any }
  );

// ── Auth core ─────────────────────────────────────────────────────────────────

export const register = async (data: RegisterInput) => {
  const existing = await authRepo.findByPhone(data.phone);

  // If user exists AND already has a password, it's a real duplicate.
  if (existing && existing.password) {
    throw conflict("Số điện thoại đã được đăng ký. Vui lòng đăng nhập.");
  }

  if (data.email) {
    const existingEmail = await authRepo.findByEmail(data.email);
    // Ensure we don't conflict with our own POS account if it somehow had the same email
    if (existingEmail && (!existing || existingEmail._id.toString() !== existing._id.toString())) {
      throw conflict("Email đã tồn tại");
    }
  }

  const hashedPassword = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
  let user;

  if (existing && !existing.password) {
    // Merge scenario: The account was created at POS. Update it with new info.
    existing.name     = data.name;
    existing.password = hashedPassword;
    if (data.email) existing.email = data.email;

    await authRepo.save(existing);
    user = existing;
  } else {
    // Normal scenario: Create a brand new account
    user = await authRepo.create({ ...data, password: hashedPassword, role: "customer" });
  }

  const accessToken  = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Lưu refresh token vào DB (dạng hash để an toàn hơn)
  user.refreshToken = refreshToken;
  await authRepo.save(user);

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
    throw unauthorized("Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Quản lý.");
  }

  const isValid = await bcrypt.compare(data.password, user.password);
  if (!isValid) throw unauthorized("Số điện thoại hoặc mật khẩu không đúng");

  const accessToken  = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Lưu refresh token vào DB
  const userWithToken = await authRepo.findByIdWithRefreshToken(user._id.toString());
  if (userWithToken) {
    userWithToken.refreshToken = refreshToken;
    await authRepo.save(userWithToken);
  }

  return { user: mapUser(user), accessToken, refreshToken };
};

export const loginPublic = async (data: LoginInput) => {
  if (!data.phone) throw unauthorized("Số điện thoại không hợp lệ");
  const user = await authRepo.findByPhone(data.phone);
  if (!user) throw unauthorized("Số điện thoại hoặc mật khẩu không đúng");

  if (!user.password) {
    throw unauthorized("Tài khoản của bạn được tạo tại Cửa hàng nhưng chưa có mật khẩu. Vui lòng Đăng ký lại hoặc chọn Quên mật khẩu để sử dụng Web.");
  }

  if (user.role !== "customer") {
    throw unauthorized("Tài khoản quản trị không thể đăng nhập tại đây");
  }

  if (user.isActive === false) {
    throw unauthorized("Tài khoản của bạn đã bị khóa.");
  }

  const isValid = await bcrypt.compare(data.password, user.password);
  if (!isValid) throw unauthorized("Số điện thoại hoặc mật khẩu không đúng");

  const accessToken  = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Lưu refresh token vào DB
  const userWithToken = await authRepo.findByIdWithRefreshToken(user._id.toString());
  if (userWithToken) {
    userWithToken.refreshToken = refreshToken;
    await authRepo.save(userWithToken);
  }

  return { user: mapUser(user), accessToken, refreshToken };
};

export const getCurrentUser = (user: UserDocument) => mapUser(user);

export const changePassword = async (userId: string, data: ChangePasswordInput) => {
  const user = await authRepo.findByIdWithPassword(userId);
  if (!user) throw notFound("Người dùng không tồn tại");
  if (!user.password) throw badRequest("Tài khoản này chưa có mật khẩu");

  const isValid = await bcrypt.compare(data.currentPassword, user.password);
  if (!isValid) throw badRequest("Mật khẩu hiện tại không đúng");

  user.password     = await bcrypt.hash(data.newPassword, BCRYPT_ROUNDS);
  user.refreshToken = undefined; // invalidate tất cả session khi đổi mật khẩu
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
  if (!user || user.refreshToken !== refreshToken) {
    throw unauthorized("Refresh token không hợp lệ hoặc đã bị thu hồi");
  }

  if (user.isActive === false) {
    throw unauthorized("Tài khoản đã bị khóa");
  }

  // [3] Issue token mới (rotation)
  const newAccessToken  = generateAccessToken(user);
  const newRefreshToken = generateRefreshToken(user);

  user.refreshToken = newRefreshToken;
  await authRepo.save(user);

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
};

export const logout = async (userId: string) => {
  const user = await authRepo.findByIdWithRefreshToken(userId);
  if (user) {
    user.refreshToken = undefined;
    await authRepo.save(user);
  }
};

// ── Forgot / Reset password ───────────────────────────────────────────────────

export const forgotPassword = async (data: ForgotPasswordInput) => {
  const user = data.email
    ? await authRepo.findByEmailWithResetToken(data.email)
    : await authRepo.findByPhoneWithResetToken(data.phone!);

  // Luôn trả thành công — không tiết lộ email/phone có tồn tại không (security)
  if (!user) return { message: "Nếu tài khoản tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi" };

  // Tạo token ngẫu nhiên 32 bytes
  const resetToken = crypto.randomBytes(32).toString("hex");

  user.resetToken       = resetToken;
  user.resetTokenExpiry = new Date(Date.now() + RESET_TOKEN_TTL);
  await authRepo.save(user);

  // Gửi email qua Resend (HTTPS API — hoạt động trên Railway Hobby)
  // Lỗi gửi email được bắt riêng bên trong — không làm fail request này
  if (user.email) {
    await sendResetPasswordEmail(user.email, resetToken);
  }

  return { message: "Nếu tài khoản tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi" };
};

export const resetPassword = async (data: ResetPasswordInput) => {
  const user = await authRepo.findByResetToken(data.token);

  if (!user || !user.resetTokenExpiry) throw badRequest("Token không hợp lệ hoặc đã hết hạn");
  if (user.resetTokenExpiry < new Date())   throw badRequest("Token đã hết hạn, vui lòng yêu cầu lại");

  user.password         = await bcrypt.hash(data.newPassword, BCRYPT_ROUNDS);
  user.resetToken       = undefined;
  user.resetTokenExpiry = undefined;
  user.refreshToken     = undefined; // invalidate tất cả session sau reset password
  await authRepo.save(user);
};
