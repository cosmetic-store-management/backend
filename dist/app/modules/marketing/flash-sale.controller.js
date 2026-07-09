import { Router } from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { catchAsync } from "../../shared/helpers/catchAsync.js";
import * as response from "../../shared/helpers/response.js";
import { createFlashSaleSchema } from "./dto/flash-sale.request.dto.js";
import * as flashSaleService from "./flash-sale.service.js";
const router = Router();
// Public API
router.get("/active", catchAsync(async (req, res) => {
    const fs = await flashSaleService.getActiveFlashSale();
    return response.success(res, { result: fs });
}));
router.get("/timeline", catchAsync(async (req, res) => {
    const fsList = await flashSaleService.getTimelineFlashSales();
    return response.success(res, { result: fsList });
}));
router.use(authenticate, authorize("owner", "manager"));
router.get("/", catchAsync(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;
    const search = req.query.search;
    const result = await flashSaleService.getAllFlashSales({ status, search }, page, limit);
    return response.success(res, result);
}));
router.post("/", validate(createFlashSaleSchema), catchAsync(async (req, res) => {
    const result = await flashSaleService.createFlashSale(req.body);
    return response.created(res, { message: "Flash sale created successfully", result });
}));
router.get("/:id", catchAsync(async (req, res) => {
    const result = await flashSaleService.getFlashSaleById(req.params.id);
    return response.success(res, { result });
}));
router.put("/:id", validate(createFlashSaleSchema), catchAsync(async (req, res) => {
    const result = await flashSaleService.updateFlashSale(req.params.id, req.body);
    return response.success(res, { message: "Flash sale updated successfully", result });
}));
router.delete("/:id", catchAsync(async (req, res) => {
    const result = await flashSaleService.deleteFlashSale(req.params.id);
    return response.success(res, result);
}));
export default router;
