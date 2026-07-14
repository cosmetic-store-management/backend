import jwt from "jsonwebtoken";
import User from "../contexts/identity/user/models/user.schema.js";
import { unauthorized, forbidden } from "../shared/errors/httpErrors.js";
/**
 * authenticate — Validate JWT and attach req.user when valid.
 */
export const authenticate = async (req, _res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith("Bearer "))
            throw unauthorized("You are not logged in");
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select("-password");
        if (!user)
            throw unauthorized("User does not exist");
        if (!user.isActive)
            throw forbidden("Your account has been locked");
        req.user = user;
        next();
    }
    catch (error) {
        if (error.name === "JsonWebTokenError")
            return next(unauthorized("Invalid token"));
        if (error.name === "TokenExpiredError")
            return next(unauthorized("Token has expired"));
        next(error);
    }
};
/**
 * optionalAuthenticate — Extract req.user if a valid token exists; otherwise continue.
 */
export const optionalAuthenticate = async (req, _res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith("Bearer ")) {
            const token = authHeader.split(" ")[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id).select("-password");
            if (user && user.isActive) {
                req.user = user;
            }
        }
        next();
    }
    catch (error) {
        // If the token is invalid or expired, treat the request as unauthenticated.
        next();
    }
};
/**
 * authorize(...roles) — Check role. Must be used after authenticate.
 */
export const authorize = (...roles) => (req, _res, next) => {
    if (!req.user)
        return next(unauthorized("You are not logged in"));
    if (!roles.includes(req.user.role))
        return next(forbidden("You do not have permission to perform this action"));
    next();
};
/**
 * requirePermission — Check a specific permission (ACL). Must be used after authenticate.
 * Owner and manager bypass all permission checks by default.
 */
export const requirePermission = (permission) => (req, _res, next) => {
    if (!req.user)
        return next(unauthorized("You are not logged in"));
    if (req.user.role === "owner" || req.user.role === "manager")
        return next();
    if (req.user.role === "customer")
        return next(forbidden("Customers do not have access to the admin system"));
    if (!req.user.permissions?.includes(permission)) {
        return next(forbidden(`You do not have permission: ${permission}`));
    }
    next();
};
/**
 * optionalAuth — Attach req.user when a valid token exists; otherwise skip.
 */
export const optionalAuth = async (req, _res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith("Bearer "))
            return next();
        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select("-password");
        if (user && user.isActive) {
            req.user = user;
        }
    }
    catch {
        // Invalid token -> ignore and continue.
    }
    next();
};
// ── Role helpers ──────────────────────────────────────────────────────────────
// Use directly in routes instead of calling authorize() with manual strings.
/** Owner only */
export const isOwner = authorize("owner");
/** Owner or manager */
export const isManager = authorize("owner", "manager");
/** Internal management (owner, manager, staff) */
export const isStaff = authorize("owner", "manager", "staff");
/** Logged in — any role */
export const isAuthenticated = authorize("owner", "manager", "staff", "customer");
// Alias giữ backward compat (có thể xóa sau khi refactor controllers)
