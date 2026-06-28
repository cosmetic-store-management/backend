import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import User, { type UserDocument } from "../models/user/user.schema.js";
import { unauthorized, forbidden } from "../shared/errors/httpErrors.js";

// Extend Express Request to include `user` and `shopId`
declare global {
  namespace Express {
    interface Request {
      user?: UserDocument;
      shopId?: string | null; // Multi-tenant context extracted from User or Header
    }
  }
}

/**
 * authenticate — Xác thực JWT, gắn req.user nếu hợp lệ.
 */
export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer "))
      throw unauthorized("Bạn chưa đăng nhập");

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET!,
    ) as jwt.JwtPayload;

    const user = await User.findById(decoded.id).select("-password");
    if (!user) throw unauthorized("Người dùng không tồn tại");
    if (!user.isActive) throw forbidden("Tài khoản của bạn đã bị khóa");

    req.user = user;

    next();
  } catch (error) {
    if ((error as Error).name === "JsonWebTokenError")
      return next(unauthorized("Token không hợp lệ"));
    if ((error as Error).name === "TokenExpiredError")
      return next(unauthorized("Token đã hết hạn"));
    next(error);
  }
};

/**
 * optionalAuthenticate — Trích xuất req.user nếu có token hợp lệ, nếu không có hoặc token hết hạn thì bỏ qua và tiếp tục.
 */
export const optionalAuthenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET!,
      ) as jwt.JwtPayload;

      const user = await User.findById(decoded.id).select("-password");
      if (user && user.isActive) {
        req.user = user;
      }
    }
    next();
  } catch (error) {
    // Nếu token lỗi hoặc hết hạn, coi như không đăng nhập
    next();
  }
};

/**
 * authorize(...roles) — Kiểm tra role. Phải dùng SAU authenticate.
 */
export const authorize =
  (...roles: string[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(unauthorized("Bạn chưa đăng nhập"));
    if (!roles.includes(req.user.role))
      return next(forbidden("Bạn không có quyền thực hiện hành động này"));
    next();
  };

/**
 * requirePermission — Kiểm tra quyền cụ thể (ACL). Phải dùng SAU authenticate.
 * Owner và Manager mặc định pass qua mọi check permission.
 */
export const requirePermission =
  (permission: string) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(unauthorized("Bạn chưa đăng nhập"));
    if (req.user.role === "owner" || req.user.role === "manager") return next();
    if (req.user.role === "customer")
      return next(
        forbidden("Khách hàng không có quyền truy cập hệ thống quản trị"),
      );

    if (!req.user.permissions?.includes(permission as any)) {
      return next(forbidden(`Bạn không có quyền: ${permission}`));
    }
    next();
  };

/**
 * optionalAuth — Gắn req.user nếu có token hợp lệ, bỏ qua nếu không.
 */
export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return next();
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET!,
    ) as jwt.JwtPayload;
    const user = await User.findById(decoded.id).select("-password");
    if (user && user.isActive) {
      req.user = user;
    }
  } catch {
    // token lỗi → bỏ qua
  }
  next();
};

// ── Role helpers ──────────────────────────────────────────────────────────────
// Dùng trực tiếp trong routes thay vì gọi authorize() với string thủ công.

/** Chỉ owner */
export const isOwner = authorize("owner");

/** Owner hoặc manager */
export const isManager = authorize("owner", "manager");

/** Quản lý nội bộ (owner, manager, staff) */
export const isStaff = authorize("owner", "manager", "staff");

/** Đã đăng nhập — bất kỳ role nào */
export const isAuthenticated = authorize(
  "owner",
  "manager",
  "staff",
  "customer",
);

// Alias giữ backward compat (có thể xóa sau khi refactor controllers)
