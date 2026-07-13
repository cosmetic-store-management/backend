


import { catchAsync } from "../../shared/helpers/catchAsync.js";

import * as response from "../../shared/helpers/response.js";


import * as categoryService from "./category.service.js";

import { logAction } from "../audit-log/audit-log.service.js";

export const getRoot = catchAsync(async (_req, res) => {
    const result = await categoryService.getPublicCategories();
    return response.success(res, result as any);
  });

export const getSlug = catchAsync(async (req, res) => {
    const category = await categoryService.getPublicCategoryDetail(
      req.params.slug as string,
    );
    return response.success(res, { category });
  });

export const getAdminList = catchAsync(async (req, res) => {
    const result = await categoryService.getAdminCategories(req.query as any);
    return response.success(res, result);
  });

export const getAdminId = catchAsync(async (req, res) => {
    const category = await categoryService.getAdminCategoryDetail(
      req.params.id as string,
    );
    return response.success(res, { category });
  });

export const postAdmin = catchAsync(async (req, res) => {
    const category = await categoryService.createCategory(req.body);
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "create",
      "catalog",
      `Tạo danh mục "${category.name}"`,
      req.ip || "127.0.0.1",
    );
    return response.created(res, {
      message: "Tạo danh mục thành công",
      category,
    });
  });

export const patchAdminIdStatus = catchAsync(async (req, res) => {
    const category = await categoryService.updateCategoryStatus(
      req.params.id as string,
      req.body.isActive,
    );
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "catalog",
      `Cập nhật trạng thái danh mục "${category.name}" thành ${category.isActive ? "Hoạt động" : "Ngừng hoạt động"}`,
      req.ip || "127.0.0.1",
    );
    return response.success(res, {
      message: "Cập nhật trạng thái danh mục thành công",
      category,
    });
  });

export const patchAdminId = catchAsync(async (req, res) => {
    const category = await categoryService.updateCategory(
      req.params.id as string,
      req.body,
    );
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "catalog",
      `Cập nhật thông tin danh mục "${category.name}"`,
      req.ip || "127.0.0.1",
    );
    return response.success(res, {
      message: "Cập nhật danh mục thành công",
      category,
    });
  });

export const deleteAdminId = catchAsync(async (req, res) => {
    const category = await categoryService.getAdminCategoryDetail(
      req.params.id as string,
    );
    await categoryService.deleteCategory(req.params.id as string);
    if (category) {
      await logAction(
        req.user!._id.toString(),
        req.user!.name,
        "delete",
        "catalog",
        `Xóa danh mục "${category.name}"`,
        req.ip || "127.0.0.1",
      );
    }
    return response.success(res, { message: "Xóa danh mục thành công" });
  });