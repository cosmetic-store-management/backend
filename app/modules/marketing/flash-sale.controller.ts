


import { catchAsync } from "../../shared/helpers/catchAsync.js";

import * as response from "../../shared/helpers/response.js";


import * as flashSaleService from "./flash-sale.service.js";

export const getActive = catchAsync(async (req, res) => {
    const fs = await flashSaleService.getActiveFlashSale();
    return response.success(res, { result: fs });
  });

export const getTimeline = catchAsync(async (req, res) => {
    const fsList = await flashSaleService.getTimelineFlashSales();
    return response.success(res, { result: fsList });
  });

export const getRoot = catchAsync(async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as string;
    const search = req.query.search as string;

    const result = await flashSaleService.getAllFlashSales({ status, search }, page, limit);
    return response.success(res, result);
  });

export const postRoot = catchAsync(async (req, res) => {
    const result = await flashSaleService.createFlashSale(req.body);
    return response.created(res, { message: "Flash sale created successfully", result });
  });

export const getId = catchAsync(async (req, res) => {
    const result = await flashSaleService.getFlashSaleById(req.params.id as string);
    return response.success(res, { result });
  });

export const putId = catchAsync(async (req, res) => {
    const result = await flashSaleService.updateFlashSale(req.params.id as string, req.body);
    return response.success(res, { message: "Flash sale updated successfully", result });
  });

export const deleteId = catchAsync(async (req, res) => {
    const result = await flashSaleService.deleteFlashSale(req.params.id as string);
    return response.success(res, result);
  });