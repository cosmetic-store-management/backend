import { Router } from "express";
import { authenticate, isStaff } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { catchAsync } from "../../shared/helpers/catchAsync.js";
import * as response from "../../shared/helpers/response.js";
import * as inventoryService from "./inventory.service.js";
import { logAction } from "../audit-log/audit-log.service.js";
import { CreateSupplierSchema, CreateGoodsReceiptSchema, AdjustStockSchema } from "./dto/inventory.request.dto.js";

const router = Router();

// ── ADMIN & STAFF ONLY ────────────────────────────────────────────────────────

// Suppliers CRUD
router.get("/suppliers", authenticate, isStaff, catchAsync(async (_req, res) => {
  const suppliers = await inventoryService.getSuppliers();
  return response.success(res, { suppliers });
}));

router.post("/suppliers", authenticate, isStaff, validate(CreateSupplierSchema), catchAsync(async (req, res) => {
  const supplier = await inventoryService.createSupplier(req.body);
  await logAction(req.user!._id.toString(), req.user!.name, "create", "inventory", `Tạo nhà cung cấp "${supplier.name}"`, req.ip || "127.0.0.1");
  return response.created(res, { message: "Tạo nhà cung cấp thành công", supplier });
}));

// Stock listing
router.get("/stock", authenticate, isStaff, catchAsync(async (req, res) => {
  const { search, page = "1", limit = "10" } = req.query;
  const result = await inventoryService.getStockList(search as string, Number(page), Number(limit));
  return response.success(res, result);
}));

// Transactions log
router.get("/transactions", authenticate, isStaff, catchAsync(async (req, res) => {
  const { page = "1", limit = "10" } = req.query;
  const result = await inventoryService.getTransactions(Number(page), Number(limit));
  return response.success(res, result);
}));

// Import stock (Goods receipt)
router.post("/goods-receipts", authenticate, isStaff, validate(CreateGoodsReceiptSchema), catchAsync(async (req, res) => {
  const receipt = await inventoryService.createGoodsReceipt(req.user!, req.body);
  await logAction(req.user!._id.toString(), req.user!.name, "import", "inventory", `Nhập kho đơn hàng "${receipt.code}", tổng giá trị ${receipt.totalAmount.toLocaleString("vi-VN")}₫`, req.ip || "127.0.0.1", req.headers["user-agent"], receipt.id);
  return response.created(res, { message: "Nhập kho sản phẩm thành công", receipt });
}));

// Adjust stock (Kiểm kho)
router.post("/stock/adjust", authenticate, isStaff, validate(AdjustStockSchema), catchAsync(async (req, res) => {
  const variant = await inventoryService.adjustStock(req.user!, req.body);
  await logAction(
    req.user!._id.toString(),
    req.user!.name,
    "update",
    "inventory",
    `Kiểm kho sản phẩm "${variant.name}": tồn kho thực tế ${req.body.actualStock}`,
    req.ip || "127.0.0.1");
  return response.success(res, { message: "Cập nhật tồn kho thành công", variant });
}));

export default router;
