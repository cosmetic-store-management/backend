import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { catchAsync } from "../../shared/helpers/catchAsync.js";
import * as response from "../../shared/helpers/response.js";
import { RegisterSchema, LoginSchema, ChangePasswordSchema, ForgotPasswordSchema, ResetPasswordSchema } from "./dto/auth.request.dto.js";
import * as authService from "./auth.service.js";
import * as auditService from "../audit-log/audit-log.service.js";
import { badRequest } from "../../shared/errors/httpErrors.js";

const router = Router();

// POST /api/auth/register
router.post("/register", validate(RegisterSchema), catchAsync(async (req, res) => {
  const result = await authService.register(req.body);
  return response.created(res, { message: "Đăng ký thành công", ...result });
}));

// POST /api/auth/admin/login
router.post("/admin/login", validate(LoginSchema), catchAsync(async (req, res) => {
  const result = await authService.loginAdmin(req.body);
  await auditService.logAction(
    result.user.id,
    result.user.name,
    "login",
    "identity",
    "Đăng nhập hệ thống quản trị",
    req.ip || req.socket.remoteAddress || "127.0.0.1");
  return response.success(res, { message: "Đăng nhập quản trị thành công", ...result });
}));

// POST /api/auth/public/login
router.post("/public/login", validate(LoginSchema), catchAsync(async (req, res) => {
  const result = await authService.loginPublic(req.body);
  return response.success(res, { message: "Đăng nhập thành công", ...result });
}));

// POST /api/auth/refresh — Đổi access token mới bằng refresh token
router.post("/refresh", catchAsync(async (req, res) => {
  const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;
  if (!refreshToken) throw badRequest("Thiếu refresh token");

  const result = await authService.refreshAccessToken(refreshToken);
  return response.success(res, { message: "Làm mới token thành công", ...result });
}));

// POST /api/auth/logout
router.post("/logout", authenticate, catchAsync(async (req, res) => {
  await authService.logout(req.user!._id.toString());
  return response.success(res, { message: "Đăng xuất thành công" });
}));

// GET /api/auth/me
router.get("/me", authenticate, catchAsync(async (req, res) => {
  const user = authService.getCurrentUser(req.user!);
  return response.success(res, { user });
}));

// POST /api/auth/change-password
router.post("/change-password", authenticate, validate(ChangePasswordSchema), catchAsync(async (req, res) => {
  await authService.changePassword(req.user!._id.toString(), req.body);
  return response.success(res, { message: "Đổi mật khẩu thành công" });
}));

// POST /api/auth/forgot-password
router.post("/forgot-password", validate(ForgotPasswordSchema), catchAsync(async (req, res) => {
  const result = await authService.forgotPassword(req.body);
  return response.success(res, result);
}));

// POST /api/auth/reset-password
router.post("/reset-password", validate(ResetPasswordSchema), catchAsync(async (req, res) => {
  await authService.resetPassword(req.body);
  return response.success(res, { message: "Đặt lại mật khẩu thành công, vui lòng đăng nhập lại" });
}));

export default router;
