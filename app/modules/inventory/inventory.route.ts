import { Router } from "express";
import { authenticate, requirePermission } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { AdjustStockSchema, CreateGoodsReceiptSchema, CreateSupplierSchema, UpdateMinStockSchema, UpdateSupplierSchema } from "./dto/inventory.request.dto.js";
import { container } from "tsyringe";
import { InventoryController } from "./inventory.controller.js";

const router = Router();
const controller = container.resolve(InventoryController);

router.get("/suppliers", authenticate, requirePermission("products.view"), controller.getSuppliers);
router.post("/suppliers", authenticate, requirePermission("products.manage"), validate(CreateSupplierSchema), controller.postSuppliers);
router.put("/suppliers/:id", authenticate, requirePermission("products.manage"), validate(UpdateSupplierSchema), controller.putSuppliersId);
router.delete("/suppliers/:id", authenticate, requirePermission("products.manage"), controller.deleteSuppliersId);
router.get("/stock", authenticate, requirePermission("products.view"), controller.getStock);
router.get("/stock/:variantId/batches", authenticate, requirePermission("products.view"), controller.getStockVariantIdBatches);
router.put("/stock/batches/:id", authenticate, requirePermission("products.manage"), controller.putStockBatchesId);
router.get("/transactions", authenticate, requirePermission("products.view"), controller.getTransactions);
router.post("/goods-receipts", authenticate, requirePermission("products.manage"), validate(CreateGoodsReceiptSchema), controller.postGoodsReceipts);
router.post("/stock/adjust", authenticate, requirePermission("products.manage"), validate(AdjustStockSchema), controller.postStockAdjust);
router.patch("/stock/min-stock", authenticate, requirePermission("products.manage"), validate(UpdateMinStockSchema), controller.patchStockMinStock);
router.get("/stats", authenticate, requirePermission("products.view"), controller.getStats);
router.get("/goods-receipts", authenticate, requirePermission("products.view"), controller.getGoodsReceipts);
router.get("/goods-receipts/:id", authenticate, requirePermission("products.view"), controller.getGoodsReceiptsId);
router.get("/stocktakes", authenticate, requirePermission("products.view"), controller.getStocktakes);
router.get("/stocktakes/:id", authenticate, requirePermission("products.view"), controller.getStocktakesId);
router.post("/stocktakes", authenticate, requirePermission("products.manage"), controller.postStocktakes);

export default router;
