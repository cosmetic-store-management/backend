import { injectable, inject } from "tsyringe";
import { catchAsync } from "../../shared/helpers/catchAsync.js";
import * as response from "../../shared/helpers/response.js";
import { ReportService } from "./report.service.js";

@injectable()
export class ReportController {
  constructor(
    @inject(ReportService) private readonly reportService: ReportService
  ) {}

  getDashboard = catchAsync(async (req, res) => {
    const { startDate, endDate } = req.query as {
      startDate?: string;
      endDate?: string;
    };
    const result = await this.reportService.getDashboardStats(startDate, endDate);
    return response.success(res, result);
  });

  getCompletionRates = catchAsync(async (req, res) => {
    const { startDate, endDate } = req.query as {
      startDate?: string;
      endDate?: string;
    };
    const result = await this.reportService.getCompletionRates(startDate, endDate);
    return response.success(res, result);
  });

  getVouchers = catchAsync(async (req, res) => {
    const { startDate, endDate } = req.query as {
      startDate?: string;
      endDate?: string;
    };
    const result = await this.reportService.getVoucherStats(startDate, endDate);
    return response.success(res, result as any);
  });

  getRevenueChart = catchAsync(async (req, res) => {
    const { startDate, endDate } = req.query as {
      startDate?: string;
      endDate?: string;
    };
    const result = await this.reportService.getRevenueChart(startDate, endDate);
    return response.success(res, result as any);
  });

  getCategoryPerformance = catchAsync(async (req, res) => {
    const { startDate, endDate } = req.query as {
      startDate?: string;
      endDate?: string;
    };
    const result = await this.reportService.getCategoryPerformance(
      startDate,
      endDate
    );
    return response.success(res, result as any);
  });

  getPaymentMethods = catchAsync(async (req, res) => {
    const { startDate, endDate } = req.query as {
      startDate?: string;
      endDate?: string;
    };
    const result = await this.reportService.getPaymentMethodsStats(
      startDate,
      endDate
    );
    return response.success(res, result as any);
  });

  getExportPdf = catchAsync(async (req, res) => {
    const { startDate, endDate } = req.query as {
      startDate?: string;
      endDate?: string;
    };
    const pdfStream = await this.reportService.generatePdfReport(startDate, endDate);
    
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Report_${new Date().toISOString().slice(0, 10)}.pdf"`);
    
    pdfStream.pipe(res);
  });
}