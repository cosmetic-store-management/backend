import { Router } from "express";
import {
  authenticate,
  requirePermission,
} from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { catchAsync } from "../../shared/helpers/catchAsync.js";
import * as response from "../../shared/helpers/response.js";
import * as inventoryService from "./inventory.service.js";
import { logAction } from "../audit-log/audit-log.service.js";
import {
  CreateSupplierSchema,
  CreateGoodsReceiptSchema,
  AdjustStockSchema,
  UpdateMinStockSchema,
} from "./dto/inventory.request.dto.js";

const router = Router();

// ── ADMIN & STAFF ONLY ────────────────────────────────────────────────────────

// Suppliers CRUD
router.get(
  "/suppliers",
  authenticate,
  requirePermission("products.view"),
  catchAsync(async (_req, res) => {
    const suppliers = await inventoryService.getSuppliers();
    return response.success(res, { suppliers });
  }),
);

router.post(
  "/suppliers",
  authenticate,
  requirePermission("products.manage"),
  validate(CreateSupplierSchema),
  catchAsync(async (req, res) => {
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
  }),
);

// Stock listing
router.get(
  "/stock",
  authenticate,
  requirePermission("products.view"),
  catchAsync(async (req, res) => {
    const { search, cursor, limit = "10" } = req.query;
    const result = await inventoryService.getStockList(
      search as string,
      cursor as string | undefined,
      Number(limit),
    );
    return response.success(res, result);
  }),
);

// Batches for a variant
router.get(
  "/stock/:variantId/batches",
  authenticate,
  requirePermission("products.view"),
  catchAsync(async (req, res) => {
    const batches = await inventoryService.getVariantBatches(req.params.variantId as string);
    return response.success(res, { batches });
  }),
);

// Update a batch
router.put(
  "/stock/batches/:id",
  authenticate,
  requirePermission("products.manage"),
  catchAsync(async (req, res) => {
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
  }),
);

// Transactions log
router.get(
  "/transactions",
  authenticate,
  requirePermission("products.view"),
  catchAsync(async (req, res) => {
    const { cursor, limit = "10", type } = req.query;
    const result = await inventoryService.getTransactions(
      cursor as string | undefined,
      Number(limit),
      type as string | undefined,
    );
    return response.success(res, result);
  }),
);

// Import stock (Goods receipt)
router.post(
  "/goods-receipts",
  authenticate,
  requirePermission("products.manage"),
  validate(CreateGoodsReceiptSchema),
  catchAsync(async (req, res) => {
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
  }),
);

// Adjust stock (Kiểm kho)
router.post(
  "/stock/adjust",
  authenticate,
  requirePermission("products.manage"),
  validate(AdjustStockSchema),
  catchAsync(async (req, res) => {
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
  }),
);

// Update Min Stock
router.patch(
  "/stock/min-stock",
  authenticate,
  requirePermission("products.manage"),
  validate(UpdateMinStockSchema),
  catchAsync(async (req, res) => {
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
  }),
);

export default router;
