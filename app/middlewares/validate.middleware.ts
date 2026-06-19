import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";
import { ZodError } from "zod";
import { badRequest } from "../shared/errors/httpErrors.js";

/**
 * validate — Zod schema middleware.
 * Parse req.body, gán lại req.body với data đã sanitize.
 * Throw 400 với message rõ ràng nếu không hợp lệ.
 */
export const validate =
  (schema: ZodSchema) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues.map((e: { message: string }) => e.message).join("; ");
      return next(badRequest(message));
    }
    req.body = result.data;
    next();
  };
