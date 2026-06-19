import type { Request, Response, NextFunction, RequestHandler } from "express";

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/**
 * catchAsync — Wrap async route handler để tự động forward error sang next().
 * Tránh phải try/catch ở mỗi controller.
 */
export const catchAsync = (fn: AsyncHandler): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
