import { Router } from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { catchAsync } from "../../shared/helpers/catchAsync.js";
import * as response from "../../shared/helpers/response.js";
import { createFlashSaleSchema } from "./dto/flash-sale.request.dto.js";
import * as flashSaleService from "./flash-sale.service.js";

const router = Router();

// Public API
router.get(
  "/active",
  catchAsync(async (req, res) => {
    const fs = await flashSaleService.getActiveFlashSale();
    return response.success(res, { result: fs });
  })
);

router.get(
  "/timeline",
  catchAsync(async (req, res) => {
    const fsList = await flashSaleService.getTimelineFlashSales();
    return response.success(res, { result: fsList });
  })
);

router.use(authenticate, authorize("owner", "manager"));

router.get(
  "/",
  catchAsync(async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const result = await flashSaleService.getAllFlashSales(page, limit);
    return response.success(res, result);
  })
);

router.post(
  "/",
  validate(createFlashSaleSchema),
  catchAsync(async (req, res) => {
    const result = await flashSaleService.createFlashSale(req.body);
    return response.created(res, { message: "Tạo Flash Sale thành công", result });
  })
);

router.get(
  "/:id",
  catchAsync(async (req, res) => {
    const result = await flashSaleService.getFlashSaleById(req.params.id as string);
    return response.success(res, { result });
  })
);

router.put(
  "/:id",
  validate(createFlashSaleSchema),
  catchAsync(async (req, res) => {
    const result = await flashSaleService.updateFlashSale(req.params.id as string, req.body);
    return response.success(res, { message: "Cập nhật Flash Sale thành công", result });
  })
);

router.delete(
  "/:id",
  catchAsync(async (req, res) => {
    const result = await flashSaleService.deleteFlashSale(req.params.id as string);
    return response.success(res, result);
  })
);

export default router;
