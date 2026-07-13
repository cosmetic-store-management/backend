import { injectable, inject } from "tsyringe";
import { Request, Response } from "express";
import { catchAsync } from "../../../shared/helpers/catchAsync.js";
import * as response from "../../../shared/helpers/response.js";
import { AuthService } from "./auth.service.js";
import { AuditLogService } from "../audit-log/audit-log.service.js";
import * as auditService from "../audit-log/audit-log.service.js";
import { badRequest } from "../../../shared/errors/httpErrors.js";
import passport from "../../../shared/config/passport.js";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

@injectable()
export class AuthController {
  constructor(
    @inject(AuthService) private readonly authService: AuthService,
    @inject(AuditLogService) private readonly auditService: AuditLogService
  ) {}

  getGoogle = passport.authenticate("google", { scope: ["profile", "email"] });

  getGoogleCallback = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) return res.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
    const tokens = await this.authService.generateTokensForOAuth(req.user as any);
    res.redirect(`${FRONTEND_URL}/auth/social-callback?token=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`);
  });

  getFacebook = passport.authenticate("facebook", { scope: ["email"] });

  getFacebookCallback = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) return res.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
    const tokens = await this.authService.generateTokensForOAuth(req.user as any);
    res.redirect(`${FRONTEND_URL}/auth/social-callback?token=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`);
  });

  postPublicSendOtp = catchAsync(async (req: Request, res: Response) => {
    const result = await this.authService.sendOtp(req.body);
    return response.success(res, result);
  });

  postPublicVerifyOtp = catchAsync(async (req: Request, res: Response) => {
    const result = await this.authService.verifyOtp(req.body);
    return response.success(res, result);
  });

  postRegister = catchAsync(async (req: Request, res: Response) => {
    const result = await this.authService.register(req.body);
    return response.created(res, { message: "Registered successfully", ...result });
  });

  postLogin = catchAsync(async (req: Request, res: Response) => {
    const result = await this.authService.login(req.body);
    if (["owner", "manager", "staff"].includes(result.user.role)) {
      await this.auditService.logAction(
        result.user.id,
        result.user.name,
        "login",
        "identity",
        "System login",
        req.ip || req.socket.remoteAddress || "127.0.0.1",
      );
    }
    return response.success(res, { message: "Logged in successfully", ...result });
  });

  postRefresh = catchAsync(async (req: Request, res: Response) => {
    const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;
    if (!refreshToken) throw badRequest("Missing refresh token");
    const result = await this.authService.refreshAccessToken(refreshToken);
    return response.success(res, { message: "Token refreshed successfully", ...result });
  });

  postLogout = catchAsync(async (req: Request, res: Response) => {
    const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;
    await this.authService.logout(req.user!._id.toString(), refreshToken);
    return response.success(res, { message: "Logged out successfully" });
  });

  getMe = catchAsync(async (req: Request, res: Response) => {
    const user = this.authService.getCurrentUser(req.user! as any);
    return response.success(res, { user });
  });

  postChangePassword = catchAsync(async (req: Request, res: Response) => {
    await this.authService.changePassword(req.user!._id.toString(), req.body);
    return response.success(res, { message: "Password changed successfully" });
  });

  postForgotPassword = catchAsync(async (req: Request, res: Response) => {
    const result = await this.authService.forgotPassword(req.body);
    return response.success(res, result);
  });

  postResetPassword = catchAsync(async (req: Request, res: Response) => {
    await this.authService.resetPassword(req.body);
    return response.success(res, { message: "Password reset successfully, please log in again" });
  });
}