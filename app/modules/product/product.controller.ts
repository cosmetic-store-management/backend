


import { catchAsync } from "../../shared/helpers/catchAsync.js";

import * as response from "../../shared/helpers/response.js";


import * as productService from "./product.service.js";

import { logAction } from "../audit-log/audit-log.service.js";

import * as recommendationService from "./recommendation.service.js";

export const getRecommendations = catchAsync(async (req, res) => {
    const limit = parseInt(req.query.limit as string, 10) || 10;
    const userId = req.user ? req.user._id.toString() : null;
    const products = await recommendationService.getRecommendations(userId, limit);
    return response.success(res, { products });
  });

export const getRoot = catchAsync(async (req, res) => {
    const result = await productService.getPublicProducts(req.query as any);
    return response.success(res, result);
  });

export const getSlug = catchAsync(async (req, res) => {
    const product = await productService.getPublicProductDetail(
      req.params.slug as string,
    );
    return response.success(res, { product });
  });

export const getIdRecommendations = catchAsync(async (req, res) => {
    const limit = parseInt(req.query.limit as string, 10) || 10;
    const products = await productService.getRecommendedProducts(
      req.params.id as string,
      limit,
    );
    return response.success(res, { products });
  });

export const getAdminList = catchAsync(async (req, res) => {
    const result = await productService.getAdminProducts({
      ...(req.query as any),
    });
    return response.success(res, result);
  });

export const getAdminId = catchAsync(async (req, res) => {
    const product = await productService.getAdminProductDetail(
      req.params.id as string,
    );
    return response.success(res, { product });
  });

export const postAdmin = catchAsync(async (req, res) => {
    const product = await productService.createProduct({
      ...req.body,
    });
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "create",
      "catalog",
      `Tạo sản phẩm "${product.name}"`,
      req.ip || "127.0.0.1",
    );
      return response.created(res, {
        message: "Product created successfully",
      product,
    });
  });

export const patchAdminIdStatus = catchAsync(async (req, res) => {
    const product = await productService.updateProductStatus(
      req.params.id as string,
      req.body.isActive,
    );
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "catalog",
      `Cập nhật trạng thái sản phẩm "${product.name}" thành ${product.isActive ? "Bán" : "Discontinued"}`,
      req.ip || "127.0.0.1",
    );
      return response.success(res, {
        message: "Product status updated successfully",
      product,
    });
  });

export const patchAdminId = catchAsync(async (req, res) => {
    const product = await productService.updateProduct(
      req.params.id as string,
      { ...req.body },
    );
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "catalog",
      `Cập nhật thông tin sản phẩm "${product.name}"`,
      req.ip || "127.0.0.1",
    );
      return response.success(res, {
        message: "Product updated successfully",
      product,
    });
  });

export const deleteAdminId = catchAsync(async (req, res) => {
    const product = await productService.getAdminProductDetail(
      req.params.id as string,
    );
    await productService.deleteProduct(req.params.id as string);
    if (product) {
      await logAction(
        req.user!._id.toString(),
        req.user!.name,
        "delete",
        "catalog",
        `Xóa sản phẩm "${product.name}"`,
        req.ip || "127.0.0.1",
      );
    }
      return response.success(res, { message: "Product deleted successfully" });
  });

export const postAdminBatchImport = catchAsync(async (req, res) => {
    const { products } = req.body;
    if (!products || !Array.isArray(products)) {
      res.status(400).json({ message: "Dữ liệu không hợp lệ" });
      return;
    }
    const result = await productService.batchImportProducts(products);
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "create",
      "catalog",
      `Import hàng loạt ${result.totalProcessed} sản phẩm/biến thể`,
      req.ip || "127.0.0.1",
    );
      return response.success(res, { message: "Import successful", result });
  });