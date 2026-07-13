


import { catchAsync } from "../../shared/helpers/catchAsync.js";

import * as response from "../../shared/helpers/response.js";


import * as userService from "./user.service.js";

import { logAction } from "../audit-log/audit-log.service.js";

export const getRoot = catchAsync(async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search as string;
    const status = req.query.status as string;
    const role = req.query.role as string;
    const hiringStatus = req.query.hiringStatus as string;
    const workingShift = req.query.workingShift as string;

    const result = await userService.getStaffUsers(
      page,
      limit,
      search,
      status,
      role,
      hiringStatus,
      workingShift,
    );
    return response.success(res, result);
  });

export const getMeTierInfo = catchAsync(async (req, res) => {
    const tierInfo = await userService.getMyTierInfo(req.user!._id.toString());
    return response.success(res, tierInfo as any);
  });

export const patchMe = catchAsync(async (req, res) => {
    const user = await userService.updateCurrentUser(
      req.user!._id.toString(),
      req.body,
    );
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "identity",
      `Updated personal profile`,
      req.ip || "127.0.0.1",
    );
    return response.success(res, {
      message: "Profile updated successfully",
      user,
    });
  });

export const patchMeAvatar = catchAsync(async (req, res) => {
    const { avatar } = req.body;
    if (!avatar) throw { status: 400, message: "Missing image data" };
    const user = await userService.updateAvatar(
      req.user!._id.toString(),
      avatar,
    );
    return response.success(res, {
      message: "Profile picture updated successfully",
      user,
    });
  });

export const postMeAddresses = catchAsync(async (req, res) => {
    const user = await userService.addAddress(
      req.user!._id.toString(),
      req.body,
    );
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "identity",
      `Added a new address`,
      req.ip || "127.0.0.1",
    );
    return response.success(res, { message: "Address added successfully", user });
  });

export const putMeAddressesAddressId = catchAsync(async (req, res) => {
    const user = await userService.updateAddress(
      req.user!._id.toString(),
      req.params.addressId as string,
      req.body,
    );
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "identity",
      `Updated address`,
      req.ip || "127.0.0.1",
    );
    return response.success(res, {
      message: "Address updated successfully",
      user,
    });
  });

export const deleteMeAddressesAddressId = catchAsync(async (req, res) => {
    const user = await userService.deleteAddress(
      req.user!._id.toString(),
      req.params.addressId as string,
    );
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "delete",
      "identity",
      `Deleted address`,
      req.ip || "127.0.0.1",
    );
    return response.success(res, { message: "Address deleted successfully", user });
  });

export const getMeFavorites = catchAsync(async (req, res) => {
    const products = await userService.getFavorites(req.user!._id.toString());
    return response.success(res, { products });
  });

export const postMeFavoritesProductId = catchAsync(async (req, res) => {
    const result = await userService.toggleFavorite(
      req.user!._id.toString(),
      req.params.productId as string,
    );
    return response.success(res, {
      message:
        result.action === "added"
          ? "Added to favorites"
          : "Removed from favorites",
      result,
    });
  });

export const getMeViewed = catchAsync(async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 12;
    const result = await userService.getRecentlyViewed(
      req.user!._id.toString(),
      page,
      limit,
    );
    return response.success(res, result);
  });

export const postMeViewedProductId = catchAsync(async (req, res) => {
    await userService.recordRecentlyViewed(
      req.user!._id.toString(),
      req.params.productId as string,
    );
    return response.success(res, { message: "Recently viewed product recorded" });
  });

export const deleteMeViewed = catchAsync(async (req, res) => {
    await userService.clearRecentlyViewed(req.user!._id.toString());
    return response.success(res, { message: "All view history cleared" });
  });

export const deleteMeViewedProductId = catchAsync(async (req, res) => {
    await userService.removeFromViewed(
      req.user!._id.toString(),
      req.params.productId as string,
    );
    return response.success(res, { message: "Product removed from history" });
  });

export const getCustomers = catchAsync(async (req, res) => {
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

    const result = await userService.getCustomers(
      page,
      limit,
      search,
      tier,
      status,
      spending,
      lastPurchase,
      sortBy,
      source,
      startDate,
      endDate,
    );
    return response.success(res, result);
  });

export const postCustomers = catchAsync(async (req, res) => {
    const customer = await userService.createManualCustomer(req.body);
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "create",
      "identity",
      `Created customer member account "${customer.name}"`,
      req.ip || "127.0.0.1",
    );
    return response.created(res, {
      message: "Customer created successfully",
      customer,
    });
  });

export const postStaff = catchAsync(async (req, res) => {
    const staff = await userService.createStaff(req.body, req.user!);
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "create",
      "identity",
      `Created staff account "${staff.name}"`,
      req.ip || "127.0.0.1",
    );
    return response.created(res, {
      message: "Staff account created successfully",
      staff,
    });
  });

export const getId = catchAsync(async (req, res) => {
    const user = await userService.getUserById(req.params.id as string);
    return response.success(res, { user });
  });

export const patchId = catchAsync(async (req, res) => {
    const user = await userService.updateUserByAdmin(
      req.params.id as string,
      req.body,
      req.user!,
    );
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "identity",
      `Edited account "${user.name}" (${user.role})`,
      req.ip || "127.0.0.1",
    );
    return response.success(res, { user });
  });

export const patchIdRole = catchAsync(async (req, res) => {
    const user = await userService.updateUserRole(
      req.params.id as string,
      req.body.role,
      req.body.permissions,
      req.user!,
    );
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "identity",
      `Cập nhật quyền tài khoản "${user.name}" thành ${req.body.role || "không đổi"}`,
      req.ip || "127.0.0.1",
    );
    return response.success(res, {
      message: "Cập nhật quyền thành công",
      user,
    });
  });

export const patchIdStatus = catchAsync(async (req, res) => {
    const user = await userService.updateUserStatus(
      req.params.id as string,
      req.body.isActive,
      req.user!,
    );
    const actionText = req.body.isActive ? "Mở khóa" : "Khóa";
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "identity",
      `${actionText} tài khoản "${user.name}"`,
      req.ip || "127.0.0.1",
    );
    return response.success(res, {
      message: `${actionText} tài khoản thành công`,
      user,
    });
  });

export const patchIdResetPassword = catchAsync(async (req, res) => {
    const user = await userService.resetUserPassword(
      req.params.id as string,
      req.user!,
    );
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "identity",
      `Đặt lại mật khẩu cho tài khoản "${user.name}"`,
      req.ip || "127.0.0.1",
    );
    return response.success(res, {
      message: "Đặt lại mật khẩu thành công (Mặc định: GlowUp@123456)",
      user,
    });
  });

export const deleteId = catchAsync(async (req, res) => {
    const targetUser = await userService.getUserById(req.params.id as string);
    if (!targetUser) throw { status: 404, message: "Không tìm thấy người dùng" };

    if (targetUser.role === "customer") {
      // Customer delete (GDPR anonymization)
      await userService.deleteUserById(req.params.id as string, req.user!);
      await logAction(
        req.user!._id.toString(),
        req.user!.name,
        "delete",
        "identity",
        `Xóa tài khoản khách hàng "${targetUser.name}"`,
        req.ip || "127.0.0.1",
      );
      return response.success(res, { message: "Xóa tài khoản khách hàng thành công" });
    } else {
      // Staff delete — requires "users.delete" permission (except for Owner)
      if (req.user!.role !== "owner" && !req.user!.permissions.includes("users.delete" as any)) {
        throw { status: 403, message: "Bạn không có quyền xóa tài khoản nhân viên" };
      }
      await userService.deleteUser(req.params.id as string, req.user!);
      await logAction(
        req.user!._id.toString(),
        req.user!.name,
        "delete",
        "identity",
        `Xóa tài khoản nhân viên "${targetUser.name}"`,
        req.ip || "127.0.0.1",
      );
      return response.success(res, { message: "Xóa tài khoản nhân viên thành công" });
    }
  });

export const patchIdInternalNotes = catchAsync(async (req, res) => {
    const { internalNotes } = req.body;
    const user = await userService.updateInternalNotes(
      req.params.id as string,
      internalNotes,
    );
    return response.success(res, { user });
  });

export const patchIdStaffNotes = catchAsync(async (req, res) => {
    const { internalNotes } = req.body;
    const user = await userService.updateStaffInternalNotes(
      req.params.id as string,
      internalNotes,
      req.user!,
    );
    return response.success(res, { user });
  });

export const patchIdPoints = catchAsync(async (req, res) => {
    const { pointsChanged, reason } = req.body;
    const user = await userService.adjustUserPoints(
      req.params.id as string,
      parseInt(pointsChanged, 10),
      reason,
      req.user!._id.toString(),
    );
    return response.success(res, { user });
  });

export const getIdPointsHistory = catchAsync(async (req, res) => {
    const history = await userService.getUserPointHistory(req.params.id as string);
    return response.success(res, { history });
  });