import { Router } from "express";
import { authenticate, isStaff, isManager, isOwner, isAuthenticated } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { catchAsync } from "../../shared/helpers/catchAsync.js";
import * as response from "../../shared/helpers/response.js";
import { UpdateProfileSchema, UpdateRoleSchema, UpdateStatusSchema, AddressSchema, CreateStaffSchema } from "./dto/user.request.dto.js";
import * as userService from "./user.service.js";
import { logAction } from "../audit-log/audit-log.service.js";

const router = Router();

// GET /api/users — admin/staff list
router.get("/", authenticate, isManager, catchAsync(async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const search = req.query.search as string;
  const status = req.query.status as string;
  const role = req.query.role as string;

  const result = await userService.getStaffUsers(page, limit, search, status, role);
  return response.success(res, result);
}));

// GET /api/users/me/tier-info
router.get("/me/tier-info", authenticate, isAuthenticated, catchAsync(async (req, res) => {
  const tierInfo = await userService.getMyTierInfo(req.user!._id.toString());
  return response.success(res, tierInfo as any);
}));

// PATCH /api/users/me
router.patch("/me", authenticate, isAuthenticated, validate(UpdateProfileSchema), catchAsync(async (req, res) => {
  const user = await userService.updateCurrentUser(req.user!._id.toString(), req.body);
  await logAction(req.user!._id.toString(), req.user!.name, "update", "identity", `Cập nhật hồ sơ cá nhân`, req.ip || "127.0.0.1");
  return response.success(res, { message: "Cập nhật thông tin thành công", user });
}));

// PATCH /api/users/me/avatar
router.patch("/me/avatar", authenticate, isAuthenticated, catchAsync(async (req, res) => {
  const { avatar } = req.body;
  if (!avatar) throw { status: 400, message: "Thiếu dữ liệu ảnh" };
  const user = await userService.updateAvatar(req.user!._id.toString(), avatar);
  return response.success(res, { message: "Cập nhật ảnh đại diện thành công", user });
}));


// POST /api/users/me/addresses
router.post("/me/addresses", authenticate, isAuthenticated, validate(AddressSchema), catchAsync(async (req, res) => {
  const user = await userService.addAddress(req.user!._id.toString(), req.body);
  await logAction(req.user!._id.toString(), req.user!.name, "update", "identity", `Thêm địa chỉ mới`, req.ip || "127.0.0.1");
  return response.success(res, { message: "Thêm địa chỉ thành công", user });
}));

// PUT /api/users/me/addresses/:addressId
router.put("/me/addresses/:addressId", authenticate, isAuthenticated, validate(AddressSchema), catchAsync(async (req, res) => {
  const user = await userService.updateAddress(req.user!._id.toString(), req.params.addressId as string, req.body);
  await logAction(req.user!._id.toString(), req.user!.name, "update", "identity", `Cập nhật địa chỉ`, req.ip || "127.0.0.1");
  return response.success(res, { message: "Cập nhật địa chỉ thành công", user });
}));

// DELETE /api/users/me/addresses/:addressId
router.delete("/me/addresses/:addressId", authenticate, isAuthenticated, catchAsync(async (req, res) => {
  const user = await userService.deleteAddress(req.user!._id.toString(), req.params.addressId as string);
  await logAction(req.user!._id.toString(), req.user!.name, "delete", "identity", `Xóa địa chỉ`, req.ip || "127.0.0.1");
  return response.success(res, { message: "Xóa địa chỉ thành công", user });
}));

// GET /api/users/me/favorites
router.get("/me/favorites", authenticate, isAuthenticated, catchAsync(async (req, res) => {
  const products = await userService.getFavorites(req.user!._id.toString());
  return response.success(res, { products });
}));

// POST /api/users/me/favorites/:productId
router.post("/me/favorites/:productId", authenticate, isAuthenticated, catchAsync(async (req, res) => {
  const result = await userService.toggleFavorite(req.user!._id.toString(), req.params.productId as string);
  return response.success(res, { message: result.action === "added" ? "Đã thêm vào danh sách yêu thích" : "Đã xóa khỏi danh sách yêu thích", result });
}));

// GET /api/users/me/viewed
router.get("/me/viewed", authenticate, isAuthenticated, catchAsync(async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 12;
  const result = await userService.getRecentlyViewed(req.user!._id.toString(), page, limit);
  return response.success(res, result);
}));

// POST /api/users/me/viewed/:productId
router.post("/me/viewed/:productId", authenticate, isAuthenticated, catchAsync(async (req, res) => {
  await userService.recordRecentlyViewed(req.user!._id.toString(), req.params.productId as string);
  return response.success(res, { message: "Đã ghi nhận sản phẩm vừa xem" });
}));

// DELETE /api/users/me/viewed — xóa toàn bộ lịch sử
router.delete("/me/viewed", authenticate, isAuthenticated, catchAsync(async (req, res) => {
  await userService.clearRecentlyViewed(req.user!._id.toString());
  return response.success(res, { message: "Đã xóa toàn bộ lịch sử xem" });
}));

// DELETE /api/users/me/viewed/:productId — xóa 1 sản phẩm
router.delete("/me/viewed/:productId", authenticate, isAuthenticated, catchAsync(async (req, res) => {
  await userService.removeFromViewed(req.user!._id.toString(), req.params.productId as string);
  return response.success(res, { message: "Đã xóa sản phẩm khỏi lịch sử" });
}));

// GET /api/users/customers — admin only
router.get("/customers", authenticate, isStaff, catchAsync(async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const search = req.query.search as string;
  const tier = req.query.tier as string;
  const status = req.query.status as string;
  const spending = req.query.spending as string;
  const lastPurchase = req.query.lastPurchase as string;
  const sortBy = req.query.sortBy as string;
  const source = req.query.source as string;
  const startDate = req.query.startDate as string;
  const endDate = req.query.endDate as string;

  const result = await userService.getCustomers(page, limit, search, tier, status, spending, lastPurchase, sortBy, source, startDate, endDate);
  return response.success(res, result);
}));

// POST /api/users/customers — admin only
router.post("/customers", authenticate, isStaff, catchAsync(async (req, res) => {
  const customer = await userService.createManualCustomer(req.body);
  await logAction(req.user!._id.toString(), req.user!.name, "create", "identity", `Tạo tài khoản khách hàng thành viên "${customer.name}"`, req.ip || "127.0.0.1");
  return response.created(res, { message: "Tạo khách hàng thành công", customer });
}));

// POST /api/users/staff — manager only (owner bypassed)
router.post("/staff", authenticate, isManager, validate(CreateStaffSchema), catchAsync(async (req, res) => {
  const staff = await userService.createStaff(req.body, req.user!);
  await logAction(req.user!._id.toString(), req.user!.name, "create", "identity", `Tạo tài khoản nhân viên "${staff.name}"`, req.ip || "127.0.0.1");
  return response.created(res, { message: "Tạo tài khoản nhân viên thành công", staff });
}));

// GET /api/users/:id — admin only
router.get("/:id", authenticate, isStaff, catchAsync(async (req, res) => {
  const user = await userService.getUserById(req.params.id as string);
  return response.success(res, { user });
}));

// PATCH /api/users/:id — owner/manager
router.patch("/:id", authenticate, isManager, catchAsync(async (req, res) => {
  const user = await userService.updateUserByAdmin(req.params.id as string, req.body, req.user!);
  await logAction(req.user!._id.toString(), req.user!.name, "update", "identity", `Chỉnh sửa tài khoản "${user.name}" (${user.role})`, req.ip || "127.0.0.1");
  return response.success(res, { user });
}));

// PATCH /api/users/:id/role — manager only
router.patch("/:id/role", authenticate, isManager, validate(UpdateRoleSchema), catchAsync(async (req, res) => {
  const user = await userService.updateUserRole(req.params.id as string, req.body.role, req.body.permissions, req.user!);
  await logAction(req.user!._id.toString(), req.user!.name, "update", "identity", `Cập nhật quyền tài khoản "${user.name}" thành ${req.body.role || "không đổi"}`, req.ip || "127.0.0.1");
  return response.success(res, { message: "Cập nhật quyền thành công", user });
}));

// PATCH /api/users/:id/status — manager only
router.patch("/:id/status", authenticate, isManager, validate(UpdateStatusSchema), catchAsync(async (req, res) => {
  const user = await userService.updateUserStatus(req.params.id as string, req.body.isActive, req.user!);
  const actionText = req.body.isActive ? "Mở khóa" : "Khóa";
  await logAction(req.user!._id.toString(), req.user!.name, "update", "identity", `${actionText} tài khoản "${user.name}"`, req.ip || "127.0.0.1");
  return response.success(res, { message: `${actionText} tài khoản thành công`, user });
}));

// PATCH /api/users/:id/reset-password — manager only
router.patch("/:id/reset-password", authenticate, isManager, catchAsync(async (req, res) => {
  const user = await userService.resetUserPassword(req.params.id as string, req.user!);
  await logAction(req.user!._id.toString(), req.user!.name, "update", "identity", `Đặt lại mật khẩu cho tài khoản "${user.name}"`, req.ip || "127.0.0.1");
  return response.success(res, { message: "Đặt lại mật khẩu thành công (Mặc định: GlowUp@123456)", user });
}));

// DELETE /api/users/:id — manager only
router.delete("/:id", authenticate, isManager, catchAsync(async (req, res) => {
  const user = await userService.getUserById(req.params.id as string);
  await userService.deleteUserById(req.params.id as string, req.user!);
  await logAction(req.user!._id.toString(), req.user!.name, "delete", "identity", `Xóa tài khoản "${user.name}"`, req.ip || "127.0.0.1");
  return response.success(res, { message: "Xóa tài khoản thành công" });
}));

// PATCH /api/users/:id/internal-notes — admin only
router.patch("/:id/internal-notes", authenticate, isStaff, catchAsync(async (req, res) => {
  const { internalNotes } = req.body;
  const user = await userService.updateInternalNotes(req.params.id as string, internalNotes);
  return response.success(res, { user });
}));

// PATCH /api/users/:id/staff-notes — manager only
router.patch("/:id/staff-notes", authenticate, isManager, catchAsync(async (req, res) => {
  const { internalNotes } = req.body;
  const user = await userService.updateStaffInternalNotes(req.params.id as string, internalNotes, req.user!);
  return response.success(res, { user });
}));

// PATCH /api/users/:id/points — admin only
router.patch("/:id/points", authenticate, isManager, catchAsync(async (req, res) => {
  const { pointsChanged, reason } = req.body;
  const user = await userService.adjustUserPoints(
    req.params.id as string, 
    parseInt(pointsChanged, 10), 
    reason, 
    req.user!._id.toString()
  );
  return response.success(res, { user });
}));

export default router;
