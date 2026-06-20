/**
 * AppError — Lỗi business logic có thể dự đoán được.
 * isOperational = true → errorHandler trả message cho client.
 * isOperational = false → crash/bug → chỉ log, ẩn chi tiết.
 */
export class AppError extends Error {
    status;
    isOperational;
    constructor(message, status, isOperational = true) {
        super(message);
        this.name = "AppError";
        this.status = status;
        this.isOperational = isOperational;
        Error.captureStackTrace(this, this.constructor);
    }
}
