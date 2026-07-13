import { injectable, inject } from "tsyringe";
import { catchAsync } from "../../../shared/helpers/catchAsync.js";
import * as response from "../../../shared/helpers/response.js";
import { InventoryService } from "./inventory.service.js";
import { AuditLogService } from "../../identity/audit-log/audit-log.service.js";

@injectable()
export class InventoryController {
  constructor(
    @inject(InventoryService) private readonly inventoryService: InventoryService,
    @inject(AuditLogService) private readonly auditService: AuditLogService
  ) {}

  getSuppliers = catchAsync(async (_req, res) => {
    const suppliers = await this.inventoryService.getSuppliers();
    return response.success(res, { suppliers });
  });

  postSuppliers = catchAsync(async (req, res) => {
    const supplier = await this.inventoryService.createSupplier(req.body);
    await this.auditService.logAction(
      req.user!._id.toString(),
      req.user!.name,
      "create",
      "inventory",
      `Tạo nhà cung cấp "${supplier.name}"`,
      req.ip || "127.0.0.1"
    );
    return response.created(res, {
      message: "Tạo nhà cung cấp thành công",
      supplier,
    });
  });

  putSuppliersId = catchAsync(async (req, res) => {
    const id = req.params.id as string;
    const supplier = await this.inventoryService.updateSupplier(id, req.body);
    await this.auditService.logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "inventory",
      `Cập nhật nhà cung cấp "${supplier.name}"`,
      req.ip || "127.0.0.1"
    );
    return response.success(res, {
      message: "Cập nhật nhà cung cấp thành công",
      supplier,
    });
  });

  deleteSuppliersId = catchAsync(async (req, res) => {
    const id = req.params.id as string;
    await this.inventoryService.deleteSupplier(id);
    await this.auditService.logAction(
      req.user!._id.toString(),
      req.user!.name,
      "delete",
      "inventory",
      `Xóa nhà cung cấp ID "${id}"`,
      req.ip || "127.0.0.1"
    );
    return response.success(res, {
      message: "Xóa nhà cung cấp thành công",
    });
  });

  getStock = catchAsync(async (req, res) => {
    const { search, page, limit = "10", stockStatus } = req.query;
    const result = await this.inventoryService.getStockList(
      search as string,
      Number(page) || 1,
      Number(limit),
      stockStatus as string
    );
    return response.success(res, result);
  });

  getStockVariantIdBatches = catchAsync(async (req, res) => {
    const batches = await this.inventoryService.getVariantBatches(req.params.variantId as string);
    return response.success(res, { batches });
  });

  putStockBatchesId = catchAsync(async (req, res) => {
    const batch = await this.inventoryService.updateBatch(req.params.id as string, req.body);
    await this.auditService.logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "inventory",
      `Cập nhật thông biến lô hàng "${batch.batchCode || batch._id}"`,
      req.ip || "127.0.0.1"
    );
    return response.success(res, {
      message: "Cập nhật lô hàng thành công",
      batch,
    });
  });

  getTransactions = catchAsync(async (req, res) => {
    const { page, limit = "10", type, variantId } = req.query;
    const result = await this.inventoryService.getTransactions(
      Number(page) || 1,
      Number(limit),
      type as string | undefined,
      variantId as string | undefined
    );
    return response.success(res, result);
  });

  postGoodsReceipts = catchAsync(async (req, res) => {
    const receipt = await this.inventoryService.createGoodsReceipt(
      req.user!,
      req.body
    );
    await this.auditService.logAction(
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

  postStockAdjust = catchAsync(async (req, res) => {
    const variant = await this.inventoryService.adjustStock(req.user!, req.body);
    const reasonText = req.body.reason ? ` (Lý do: ${req.body.reason})` : "";
    await this.auditService.logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "inventory",
      `Kiểm kho sản phẩm "${variant!.name}": tồn kho thực tế ${req.body.actualStock}${reasonText}`,
      req.ip || "127.0.0.1"
    );
    return response.success(res, {
      message: "Cập nhật tồn kho thành công",
      variant,
    });
  });

  patchStockMinStock = catchAsync(async (req, res) => {
    const variant = await this.inventoryService.updateMinStock(req.user!, req.body);
    await this.auditService.logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "inventory",
      `Cập nhật định mức tồn kho tối thiểu của sản phẩm "${variant!.name}" thành ${req.body.minStock}`,
      req.ip || "127.0.0.1"
    );
    return response.success(res, {
      message: "Cập nhật định mức tồn kho thành công",
      variant,
    });
  });

  getStats = catchAsync(async (req, res) => {
    const stats = await this.inventoryService.getInventoryStats();
    return response.success(res, stats as any);
  });

  getGoodsReceipts = catchAsync(async (req, res) => {
    const { page, limit = "10", search } = req.query;
    const result = await this.inventoryService.getGoodsReceipts(
      Number(page) || 1,
      Number(limit),
      search as string | undefined
    );
    return response.success(res, result);
  });

  getGoodsReceiptsId = catchAsync(async (req, res) => {
    const result = await this.inventoryService.getGoodsReceiptDetail(req.params.id as string);
    return response.success(res, result as any);
  });

  getStocktakes = catchAsync(async (req, res) => {
    const { page, limit = "10", search } = req.query;
    const result = await this.inventoryService.getStocktakes(
      Number(page) || 1,
      Number(limit),
      search as string | undefined
    );
    return response.success(res, result);
  });

  getStocktakesId = catchAsync(async (req, res) => {
    const result = await this.inventoryService.getStocktakeDetail(req.params.id as string);
    return response.success(res, result as any);
  });

  postStocktakes = catchAsync(async (req, res) => {
    const stocktake = await this.inventoryService.createStocktake(req.user!, req.body);
    await this.auditService.logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "inventory",
      `Tạo phiếu kiểm kho "${stocktake.code}", chênh lệch ${stocktake.totalVarianceQty} sản phẩm`,
      req.ip || "127.0.0.1"
    );
    return response.created(res, {
      message: "Tạo phiếu kiểm kho thành công",
      stocktake,
    });
  });
}