import { AppError } from "./AppError.js";

export const badRequest = (message = "Yêu cầu không hợp lệ") =>
  new AppError(message, 400);
export const unauthorized = (message = "Bạn chưa đăng nhập") =>
  new AppError(message, 401);
export const forbidden = (
  message = "Bạn không có quyền thực hiện hành động này",
) => new AppError(message, 403);
export const notFound = (message = "Không tìm thấy tài nguyên") =>
  new AppError(message, 404);
export const conflict = (message = "Dữ liệu đã tồn tại") =>
  new AppError(message, 409);
