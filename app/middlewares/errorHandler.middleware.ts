import type { Request, Response, NextFunction } from "express";
import { AppError } from "../shared/errors/AppError.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction): void => {
  if (err instanceof AppError) {
    res.status(err.status).json({ success: false, message: err.message });
    return;
  }

  // MongoDB duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    res.status(409).json({ success: false, message: `${field} đã tồn tại` });
    return;
  }

  console.error("[Unexpected Error]", {
    message: err?.message,
    name:    err?.name,
    path:    _req.path,
    method:  _req.method,
    stack:   err?.stack?.split("\n").slice(0, 5).join(" | "),
  });
  res.status(500).json({ success: false, message: "Lỗi server, vui lòng thử lại sau" });
};
