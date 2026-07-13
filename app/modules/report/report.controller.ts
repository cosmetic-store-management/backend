

import { catchAsync } from "../../shared/helpers/catchAsync.js";

import * as response from "../../shared/helpers/response.js";

import * as reportService from "./report.service.js";

export const getDashboard = catchAsync(async (req, res) => {
    const { startDate, endDate } = req.query as {
      startDate?: string;
      endDate?: string;
    };
    const result = await reportService.getDashboardStats(startDate, endDate);
    return response.success(res, result);
  });

export const getCompletionRates = catchAsync(async (req, res) => {
    const { startDate, endDate } = req.query as {
      startDate?: string;
      endDate?: string;
    };
    const result = await reportService.getCompletionRates(startDate, endDate);
    return response.success(res, result);
  });

export const getVouchers = catchAsync(async (req, res) => {
    const { startDate, endDate } = req.query as {
      startDate?: string;
      endDate?: string;
    };
    const result = await reportService.getVoucherStats(startDate, endDate);
    return response.success(res, result as any);
  });

export const getRevenueChart = catchAsync(async (req, res) => {
    const { startDate, endDate } = req.query as {
      startDate?: string;
      endDate?: string;
    };
    const result = await reportService.getRevenueChart(startDate, endDate);
    return response.success(res, result as any);
  });

export const getCategoryPerformance = catchAsync(async (req, res) => {
    const { startDate, endDate } = req.query as {
      startDate?: string;
      endDate?: string;
    };
    const result = await reportService.getCategoryPerformance(
      startDate,
      endDate,
    );
    return response.success(res, result as any);
  });

export const getPaymentMethods = catchAsync(async (req, res) => {
    const { startDate, endDate } = req.query as {
      startDate?: string;
      endDate?: string;
    };
    const result = await reportService.getPaymentMethodsStats(
      startDate,
      endDate,
    );
    return response.success(res, result as any);
  });

export const getExportPdf = catchAsync(async (req, res) => {
    const { startDate, endDate } = req.query as {
      startDate?: string;
      endDate?: string;
    };
    const pdfStream = await reportService.generatePdfReport(startDate, endDate);
    
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Report_${new Date().toISOString().slice(0, 10)}.pdf"`);
    
    pdfStream.pipe(res);
  });