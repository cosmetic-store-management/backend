import { injectable, inject } from "tsyringe";
import { catchAsync } from "../../shared/helpers/catchAsync.js";
import * as response from "../../shared/helpers/response.js";
import { AuditLogService } from "./audit-log.service.js";

@injectable()
export class AuditLogController {
  constructor(
    @inject(AuditLogService) private readonly auditService: AuditLogService
  ) {}

  getRoot = catchAsync(async (req, res) => {
    const { search, domain, startDate, endDate, page, limit = "20" } = req.query;
    const result = await this.auditService.getAuditLogs(
      search as string,
      domain as string,
      startDate as string,
      endDate as string,
      Number(page) || 1,
      Number(limit)
    );
    return response.success(res, result);
  });
}