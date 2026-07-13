import { Router } from "express";
import { container } from "tsyringe";
import passport from "../../shared/config/passport.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { authLimiter } from "../../middlewares/rateLimit.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { ChangePasswordSchema, ForgotPasswordSchema, LoginSchema, RegisterSchema, ResetPasswordSchema, SendOtpSchema, VerifyOtpSchema } from "./dto/auth.request.dto.js";
import { AuthController } from "./auth.controller.js";

const router = Router();
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const controller = container.resolve(AuthController);

router.get("/google", controller.getGoogle);
router.get("/google/callback", passport.authenticate("google", { session: false, failureRedirect: `${FRONTEND_URL}/login?error=oauth_failed` }), controller.getGoogleCallback);
router.get("/facebook", controller.getFacebook);
router.get("/facebook/callback", passport.authenticate("facebook", { session: false, failureRedirect: `${FRONTEND_URL}/login?error=oauth_failed` }), controller.getFacebookCallback);
router.post("/public/send-otp", authLimiter, validate(SendOtpSchema), controller.postPublicSendOtp);
router.post("/public/verify-otp", authLimiter, validate(VerifyOtpSchema), controller.postPublicVerifyOtp);
router.post("/register", authLimiter, validate(RegisterSchema), controller.postRegister);
router.post("/login", authLimiter, validate(LoginSchema), controller.postLogin);
router.post("/refresh", controller.postRefresh);
router.post("/logout", authenticate, controller.postLogout);
router.get("/me", authenticate, controller.getMe);
router.post("/change-password", authenticate, validate(ChangePasswordSchema), controller.postChangePassword);
router.post("/forgot-password", authLimiter, validate(ForgotPasswordSchema), controller.postForgotPassword);
router.post("/reset-password", authLimiter, validate(ResetPasswordSchema), controller.postResetPassword);

export default router;
