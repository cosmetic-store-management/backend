import jwt from "jsonwebtoken";
import User from "../models/user.schema.js";
import { unauthorized, forbidden } from "../shared/errors/httpErrors.js";
/**
 * authenticate — Xác thực JWT, gắn req.user nếu hợp lệ.
 */
export const authenticate = async (req, _res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith("Bearer "))
            throw unauthorized("Bạn chưa đăng nhập");
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select("-password");
        if (!user)
            throw unauthorized("Người dùng không tồn tại");
        req.user = user;
        next();
    }
    catch (error) {
        if (error.name === "JsonWebTokenError")
            return next(unauthorized("Token không hợp lệ"));
        if (error.name === "TokenExpiredError")
            return next(unauthorized("Token đã hết hạn"));
        next(error);
    }
};
/**
 * authorize(...roles) — Kiểm tra role. Phải dùng SAU authenticate.
 */
export const authorize = (...roles) => (req, _res, next) => {
    if (!req.user)
        return next(unauthorized("Bạn chưa đăng nhập"));
    if (!roles.includes(req.user.role))
        return next(forbidden("Bạn không có quyền thực hiện hành động này"));
    next();
};
/**
 * requirePermission — Kiểm tra quyền cụ thể (ACL). Phải dùng SAU authenticate.
 * Owner và Manager mặc định pass qua mọi check permission.
 */
export const requirePermission = (permission) => (req, _res, next) => {
    if (!req.user)
        return next(unauthorized("Bạn chưa đăng nhập"));
    if (req.user.role === "owner")
        return next();
    if (req.user.role === "customer")
        return next(forbidden("Khách hàng không có quyền truy cập hệ thống quản trị"));
    if (!req.user.permissions?.includes(permission)) {
        return next(forbidden(`Bạn không có quyền: ${permission}`));
    }
    next();
};
/**
 * optionalAuth — Gắn req.user nếu có token hợp lệ, bỏ qua nếu không.
 */
export const optionalAuth = async (req, _res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith("Bearer "))
            return next();
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select("-password");
        if (user) {
            req.user = user;
        }
    }
    catch {
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
export const isAuthenticated = authorize("owner", "manager", "staff", "customer");
// Alias giữ backward compat (có thể xóa sau khi refactor controllers)
