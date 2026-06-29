import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { catchAsync } from "../../shared/helpers/catchAsync.js";
import * as response from "../../shared/helpers/response.js";
import {
  RegisterSchema,
  LoginSchema,
  ChangePasswordSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  SendOtpSchema,
  VerifyOtpSchema,
} from "./dto/auth.request.dto.js";
import * as authService from "./auth.service.js";
import * as auditService from "../audit-log/audit-log.service.js";
import { badRequest } from "../../shared/errors/httpErrors.js";
import passport from "../../shared/config/passport.js";
import { authLimiter } from "../../middlewares/rateLimit.middleware.js";

const router = Router();
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// === OAUTH ROUTES ===

// Google
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: `${FRONTEND_URL}/login?error=oauth_failed` }),
  catchAsync(async (req, res) => {
    if (!req.user) return res.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
    // req.user được gán bởi Strategy (đã check/create trong DB)
    const tokens = await authService.generateTokensForOAuth(req.user as any);
    res.redirect(`${FRONTEND_URL}/auth/social-callback?token=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`);
  })
);

// Facebook
router.get(
  "/facebook",
  passport.authenticate("facebook", { scope: ["email"] })
);

router.get(
  "/facebook/callback",
  passport.authenticate("facebook", { session: false, failureRedirect: `${FRONTEND_URL}/login?error=oauth_failed` }),
  catchAsync(async (req, res) => {
    if (!req.user) return res.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
    const tokens = await authService.generateTokensForOAuth(req.user as any);
    res.redirect(`${FRONTEND_URL}/auth/social-callback?token=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`);
  })
);
// POST /api/auth/send-otp
router.post(
  "/public/send-otp",
  authLimiter,
  validate(SendOtpSchema),
  catchAsync(async (req, res) => {
    const result = await authService.sendOtp(req.body);
    return response.success(res, result);
  }),
);

// POST /api/auth/verify-otp
router.post(
  "/public/verify-otp",
  authLimiter,
  validate(VerifyOtpSchema),
  catchAsync(async (req, res) => {
    const result = await authService.verifyOtp(req.body);
    return response.success(res, result);
  }),
);

// POST /api/auth/register
router.post(
  "/register",
  authLimiter,
  validate(RegisterSchema),
  catchAsync(async (req, res) => {
    const result = await authService.register(req.body);
    return response.created(res, { message: "Registered successfully", ...result });
  }),
);

// POST /api/auth/login
router.post(
  "/login",
  authLimiter,
  validate(LoginSchema),
  catchAsync(async (req, res) => {
    const result = await authService.login(req.body);
    
    // Ghi log hành động nếu là tài khoản quản trị
    if (["owner", "manager", "staff"].includes(result.user.role)) {
      await auditService.logAction(
        result.user.id,
        result.user.name,
        "login",
        "identity",
        "System login",
        req.ip || req.socket.remoteAddress || "127.0.0.1",
      );
    }

    return response.success(res, {
      message: "Logged in successfully",
      ...result,
    });
  }),
);

// POST /api/auth/refresh — Đổi access token mới bằng refresh token
router.post(
  "/refresh",
  catchAsync(async (req, res) => {
    const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;
    if (!refreshToken) throw badRequest("Missing refresh token");

    const result = await authService.refreshAccessToken(refreshToken);
    return response.success(res, {
      message: "Token refreshed successfully",
      ...result,
    });
  }),
);

// POST /api/auth/logout
router.post(
  "/logout",
  authenticate,
  catchAsync(async (req, res) => {
    const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;
    await authService.logout(req.user!._id.toString(), refreshToken);
    return response.success(res, { message: "Logged out successfully" });
  }),
);

// GET /api/auth/me
router.get(
  "/me",
  authenticate,
  catchAsync(async (req, res) => {
    const user = authService.getCurrentUser(req.user!);
    return response.success(res, { user });
  }),
);

// POST /api/auth/change-password
router.post(
  "/change-password",
  authenticate,
  validate(ChangePasswordSchema),
  catchAsync(async (req, res) => {
    await authService.changePassword(req.user!._id.toString(), req.body);
    return response.success(res, { message: "Password changed successfully" });
  }),
);

// POST /api/auth/forgot-password
router.post(
  "/forgot-password",
  authLimiter,
  validate(ForgotPasswordSchema),
  catchAsync(async (req, res) => {
    const result = await authService.forgotPassword(req.body);
    return response.success(res, result);
  }),
);

// POST /api/auth/reset-password
router.post(
  "/reset-password",
  authLimiter,
  validate(ResetPasswordSchema),
  catchAsync(async (req, res) => {
    await authService.resetPassword(req.body);
    return response.success(res, {
      message: "Password reset successfully, please log in again",
    });
  }),
);

export default router;
