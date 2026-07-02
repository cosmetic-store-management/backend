import { AppError } from "./AppError.js";

export const badRequest = (message = "Invalid request") =>
  new AppError(message, 400);
export const unauthorized = (message = "You are not logged in") =>
  new AppError(message, 401);
export const forbidden = (
  message = "You do not have permission to perform this action",
) => new AppError(message, 403);
export const notFound = (message = "Resource not found") =>
  new AppError(message, 404);
export const conflict = (message = "Data already exists") =>
  new AppError(message, 409);
