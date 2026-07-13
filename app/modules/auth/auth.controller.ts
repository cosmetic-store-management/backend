


import { catchAsync } from "../../shared/helpers/catchAsync.js";

import * as response from "../../shared/helpers/response.js";


import * as authService from "./auth.service.js";

import * as auditService from "../audit-log/audit-log.service.js";

import { badRequest } from "../../shared/errors/httpErrors.js";

import passport from "../../shared/config/passport.js";


const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

export const getGoogle = passport.authenticate("google", { scope: ["profile", "email"] });

export const getGoogleCallback = catchAsync(async (req, res) => {
    if (!req.user) return res.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
    // req.user được gán bởi Strategy (đã check/create trong DB)
    const tokens = await authService.generateTokensForOAuth(req.user as any);
    res.redirect(`${FRONTEND_URL}/auth/social-callback?token=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`);
  });

export const getFacebook = passport.authenticate("facebook", { scope: ["email"] });

export const getFacebookCallback = catchAsync(async (req, res) => {
    if (!req.user) return res.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
    const tokens = await authService.generateTokensForOAuth(req.user as any);
    res.redirect(`${FRONTEND_URL}/auth/social-callback?token=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`);
  });

export const postPublicSendOtp = catchAsync(async (req, res) => {
    const result = await authService.sendOtp(req.body);
    return response.success(res, result);
  });

export const postPublicVerifyOtp = catchAsync(async (req, res) => {
    const result = await authService.verifyOtp(req.body);
    return response.success(res, result);
  });

export const postRegister = catchAsync(async (req, res) => {
    const result = await authService.register(req.body);
    return response.created(res, { message: "Registered successfully", ...result });
  });

export const postLogin = catchAsync(async (req, res) => {
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
  });

export const postRefresh = catchAsync(async (req, res) => {
    const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;
    if (!refreshToken) throw badRequest("Missing refresh token");

    const result = await authService.refreshAccessToken(refreshToken);
    return response.success(res, {
      message: "Token refreshed successfully",
      ...result,
    });
  });

export const postLogout = catchAsync(async (req, res) => {
    const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;
    await authService.logout(req.user!._id.toString(), refreshToken);
    return response.success(res, { message: "Logged out successfully" });
  });

export const getMe = catchAsync(async (req, res) => {
    const user = authService.getCurrentUser(req.user!);
    return response.success(res, { user });
  });

export const postChangePassword = catchAsync(async (req, res) => {
    await authService.changePassword(req.user!._id.toString(), req.body);
    return response.success(res, { message: "Password changed successfully" });
  });

export const postForgotPassword = catchAsync(async (req, res) => {
    const result = await authService.forgotPassword(req.body);
    return response.success(res, result);
  });

export const postResetPassword = catchAsync(async (req, res) => {
    await authService.resetPassword(req.body);
    return response.success(res, {
      message: "Password reset successfully, please log in again",
    });
  });