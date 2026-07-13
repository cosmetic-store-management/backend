


import { catchAsync } from "../../shared/helpers/catchAsync.js";

import * as response from "../../shared/helpers/response.js";


import * as brandService from "./brand.service.js";

import { logAction } from "../audit-log/audit-log.service.js";

export const getRoot = catchAsync(async (_req, res) => {
    const result = await brandService.getPublicBrands();
    return response.success(res, { brands: result });
  });

export const getId = catchAsync(async (req, res) => {
    const brand = await brandService.getBrandDetail(req.params.id as string);
    if (!brand.isActive) throw new Error("Brand is inactive");
    return response.success(res, { brand });
  });

export const getAdminList = catchAsync(async (req, res) => {
    const result = await brandService.getAdminBrands(req.query as any);
    return response.success(res, result);
  });

export const getAdminId = catchAsync(async (req, res) => {
    const brand = await brandService.getBrandDetail(req.params.id as string);
    return response.success(res, { brand });
  });

export const postAdmin = catchAsync(async (req, res) => {
    const brand = await brandService.createBrand(req.body);
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "create",
      "catalog",
      `Tạo thương hiệu "${brand.name}"`,
      req.ip || "127.0.0.1",
    );
    return response.created(res, {
      message: "Brand created successfully",
      brand,
    });
  });

export const patchAdminIdStatus = catchAsync(async (req, res) => {
    const brand = await brandService.updateBrandStatus(
      req.params.id as string,
      req.body.isActive,
    );
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "catalog",
      `Cập nhật trạng thái thương hiệu "${brand.name}" thành ${brand.isActive ? "Kích hoạt" : "Ngừng kích hoạt"}`,
      req.ip || "127.0.0.1",
    );
    return response.success(res, {
      message: "Cập nhật trạng thái thương hiệu thành công",
      brand,
    });
  });

export const patchAdminId = catchAsync(async (req, res) => {
    const brand = await brandService.updateBrand(
      req.params.id as string,
      req.body,
    );
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "catalog",
      `Cập nhật thông tin thương hiệu "${brand.name}"`,
      req.ip || "127.0.0.1",
    );
    return response.success(res, {
      message: "Cập nhật thương hiệu thành công",
      brand,
    });
  });

export const deleteAdminId = catchAsync(async (req, res) => {
    const brand = await brandService.getBrandDetail(req.params.id as string);
    await brandService.deleteBrand(req.params.id as string);
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "delete",
      "catalog",
      `Xóa thương hiệu "${brand.name}"`,
      req.ip || "127.0.0.1",
    );
    return response.success(res, { message: "Xóa thương hiệu thành công" });
  });