import { injectable, inject } from "tsyringe";
import { catchAsync } from "../../shared/helpers/catchAsync.js";
import * as response from "../../shared/helpers/response.js";
import { FlashSaleService } from "./flash-sale.service.js";

@injectable()
export class FlashSaleController {
  constructor(
    @inject(FlashSaleService) private readonly flashSaleService: FlashSaleService
  ) {}

  getActive = catchAsync(async (req, res) => {
    const fs = await this.flashSaleService.getActiveFlashSale();
    return response.success(res, { result: fs });
  });

  getTimeline = catchAsync(async (req, res) => {
    const fsList = await this.flashSaleService.getTimelineFlashSales();
    return response.success(res, { result: fsList });
  });

  getRoot = catchAsync(async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as string;
    const search = req.query.search as string;

    const result = await this.flashSaleService.getAllFlashSales({ status, search }, page, limit);
    return response.success(res, result);
  });

  postRoot = catchAsync(async (req, res) => {
    const result = await this.flashSaleService.createFlashSale(req.body);
    return response.created(res, { message: "Flash sale created successfully", result });
  });

  getId = catchAsync(async (req, res) => {
    const result = await this.flashSaleService.getFlashSaleById(req.params.id as string);
    return response.success(res, { result });
  });

  putId = catchAsync(async (req, res) => {
    const result = await this.flashSaleService.updateFlashSale(req.params.id as string, req.body);
    return response.success(res, { message: "Flash sale updated successfully", result });
  });

  deleteId = catchAsync(async (req, res) => {
    const result = await this.flashSaleService.deleteFlashSale(req.params.id as string);
    return response.success(res, result);
  });
}