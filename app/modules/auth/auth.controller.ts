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
    return response.created(res, { message: "Đăng ký thành công", ...result });
  }),
);

// POST /api/auth/admin/login
router.post(
  "/admin/login",
  authLimiter,
  validate(LoginSchema),
  catchAsync(async (req, res) => {
    const result = await authService.loginAdmin(req.body);
    await auditService.logAction(
      result.user.id,
      result.user.name,
      "login",
      "identity",
      "Đăng nhập hệ thống quản trị",
      req.ip || req.socket.remoteAddress || "127.0.0.1",
    );
    return response.success(res, {
      message: "Đăng nhập quản trị thành công",
      ...result,
    });
  }),
);

/**
 * @swagger
 * /auth/public/login:
 *   post:
 *     summary: Khách hàng đăng nhập
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 example: password123
 *     responses:
 *       200:
 *         description: Đăng nhập thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Đăng nhập thành công
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                     refreshToken:
 *                       type: string
 *                     user:
 *                       type: object
 *       400:
 *         description: Thông tin đăng nhập không hợp lệ
 */
// POST /api/auth/public/login
router.post(
  "/public/login",
  authLimiter,
  validate(LoginSchema),
  catchAsync(async (req, res) => {
    const result = await authService.loginPublic(req.body);
    return response.success(res, {
      message: "Đăng nhập thành công",
      ...result,
    });
  }),
);

// POST /api/auth/refresh — Đổi access token mới bằng refresh token
router.post(
  "/refresh",
  catchAsync(async (req, res) => {
    const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;
    if (!refreshToken) throw badRequest("Thiếu refresh token");

    const result = await authService.refreshAccessToken(refreshToken);
    return response.success(res, {
      message: "Làm mới token thành công",
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
    return response.success(res, { message: "Đăng xuất thành công" });
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
    return response.success(res, { message: "Đổi mật khẩu thành công" });
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
      message: "Đặt lại mật khẩu thành công, vui lòng đăng nhập lại",
    });
  }),
);

export default router;
