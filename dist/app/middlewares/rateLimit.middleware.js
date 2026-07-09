import rateLimit from "express-rate-limit";
const skipRateLimit = process.env.DISABLE_RATE_LIMIT === "true";
// Global limiter: Áp dụng chung cho toàn bộ app
export const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100000, // Tạm thời nới lỏng để k6 ép tải (Load Test)
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many requests, please try again later",
    },
    skip: () => skipRateLimit,
});
// Auth limiter: Chống Brute-force, chỉ áp dụng cho các API nhạy cảm (login, register, otp)
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15, // Chỉ cho phép 15 requests/15 phút đối với đăng nhập, đăng ký
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many authentication requests from this IP, please try again in 15 minutes",
    },
    skip: () => skipRateLimit,
});
