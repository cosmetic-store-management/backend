


import { catchAsync } from "../../shared/helpers/catchAsync.js";

import * as response from "../../shared/helpers/response.js";

import * as inventoryService from "./inventory.service.js";

import { logAction } from "../audit-log/audit-log.service.js";


export const getSuppliers = catchAsync(async (_req, res) => {
    const suppliers = await inventoryService.getSuppliers();
    return response.success(res, { suppliers });
  });

export const postSuppliers = catchAsync(async (req, res) => {
    const supplier = await inventoryService.createSupplier(req.body);
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "create",
      "inventory",
      `Tạo nhà cung cấp "${supplier.name}"`,
      req.ip || "127.0.0.1",
    );
    return response.created(res, {
      message: "Tạo nhà cung cấp thành công",
      supplier,
    });
  });

export const putSuppliersId = catchAsync(async (req, res) => {
    const id = req.params.id as string;
    const supplier = await inventoryService.updateSupplier(id, req.body);
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "inventory",
      `Cập nhật nhà cung cấp "${supplier.name}"`,
      req.ip || "127.0.0.1",
    );
    return response.success(res, {
      message: "Cập nhật nhà cung cấp thành công",
      supplier,
    });
  });

export const deleteSuppliersId = catchAsync(async (req, res) => {
    const id = req.params.id as string;
    await inventoryService.deleteSupplier(id);
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "delete",
      "inventory",
      `Xóa nhà cung cấp ID "${id}"`,
      req.ip || "127.0.0.1",
    );
    return response.success(res, {
      message: "Xóa nhà cung cấp thành công",
    });
  });

export const getStock = catchAsync(async (req, res) => {
    const { search, page, limit = "10", stockStatus } = req.query;
    const result = await inventoryService.getStockList(
      search as string,
      Number(page) || 1,
      Number(limit),
      stockStatus as string,
    );
    return response.success(res, result);
  });

export const getStockVariantIdBatches = catchAsync(async (req, res) => {
    const batches = await inventoryService.getVariantBatches(req.params.variantId as string);
    return response.success(res, { batches });
  });

export const putStockBatchesId = catchAsync(async (req, res) => {
    const batch = await inventoryService.updateBatch(req.params.id as string, req.body);
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "inventory",
      `Cập nhật thông tin lô hàng "${batch.batchCode || batch._id}"`,
      req.ip || "127.0.0.1",
    );
    return response.success(res, {
      message: "Cập nhật lô hàng thành công",
      batch,
    });
  });

export const getTransactions = catchAsync(async (req, res) => {
    const { page, limit = "10", type, variantId } = req.query;
    const result = await inventoryService.getTransactions(
      Number(page) || 1,
      Number(limit),
      type as string | undefined,
      variantId as string | undefined,
    );
    return response.success(res, result);
  });

export const postGoodsReceipts = catchAsync(async (req, res) => {
    const receipt = await inventoryService.createGoodsReceipt(
      req.user!,
      req.body,
    );
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "import",
      "inventory",
      `Nhập kho đơn hàng "${receipt.code}", tổng giá trị ${receipt.totalAmount.toLocaleString("vi-VN")}₫`,
      req.ip || "127.0.0.1"
    );
    return response.created(res, {
      message: "Nhập kho sản phẩm thành công",
      receipt,
    });
  });

export const postStockAdjust = catchAsync(async (req, res) => {
    const variant = await inventoryService.adjustStock(req.user!, req.body);
    const reasonText = req.body.reason ? ` (Lý do: ${req.body.reason})` : "";
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "inventory",
      `Kiểm kho sản phẩm "${variant!.name}": tồn kho thực tế ${req.body.actualStock}${reasonText}`,
      req.ip || "127.0.0.1",
    );
    return response.success(res, {
      message: "Cập nhật tồn kho thành công",
      variant,
    });
  });

export const patchStockMinStock = catchAsync(async (req, res) => {
    const variant = await inventoryService.updateMinStock(req.user!, req.body);
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "inventory",
      `Cập nhật định mức tồn kho tối thiểu của sản phẩm "${variant!.name}" thành ${req.body.minStock}`,
      req.ip || "127.0.0.1",
    );
    return response.success(res, {
      message: "Cập nhật định mức tồn kho thành công",
      variant,
    });
  });

export const getStats = catchAsync(async (req, res) => {
    const stats = await inventoryService.getInventoryStats();
    return response.success(res, stats as any);
  });

export const getGoodsReceipts = catchAsync(async (req, res) => {
    const { page, limit = "10", search } = req.query;
    const result = await inventoryService.getGoodsReceipts(
      Number(page) || 1,
      Number(limit),
      search as string | undefined,
    );
    return response.success(res, result);
  });

export const getGoodsReceiptsId = catchAsync(async (req, res) => {
    const result = await inventoryService.getGoodsReceiptDetail(req.params.id as string);
    return response.success(res, result as any);
  });

export const getStocktakes = catchAsync(async (req, res) => {
    const { page, limit = "10", search } = req.query;
    const result = await inventoryService.getStocktakes(
      Number(page) || 1,
      Number(limit),
      search as string | undefined,
    );
    return response.success(res, result);
  });

export const getStocktakesId = catchAsync(async (req, res) => {
    const result = await inventoryService.getStocktakeDetail(req.params.id as string);
    return response.success(res, result as any);
  });

export const postStocktakes = catchAsync(async (req, res) => {
    const stocktake = await inventoryService.createStocktake(req.user!, req.body);
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "inventory",
      `Tạo phiếu kiểm kho "${stocktake.code}", chênh lệch ${stocktake.totalVarianceQty} sản phẩm`,
      req.ip || "127.0.0.1",
    );
    return response.created(res, {
      message: "Tạo phiếu kiểm kho thành công",
      stocktake,
    });
  });