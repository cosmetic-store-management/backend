import { injectable, inject } from "tsyringe";
import { AuditLogRepository } from "./audit-log.repository.js";

@injectable()
export class AuditLogService {
  constructor(
    @inject(AuditLogRepository) private readonly auditRepo: AuditLogRepository
  ) {}

  async logAction(
    userId: string | undefined,
    userName: string,
    action: "create" | "update" | "delete" | "login" | "logout" | "import" | "checkout" | "export",
    domain: "identity" | "catalog" | "inventory" | "sales" | "settings" | "system",
    description: string,
    ipAddress: string,
  ) {
    try {
      await this.auditRepo.createLog({
        userId,
        userName,
        action,
        domain,
        description,
        ipAddress: ipAddress || "127.0.0.1",
      });
    } catch (err) {
      console.error("Failed to write audit log:", err);
    }
  }

  async getAuditLogs(
    search?: string,
    domain?: string,
    startDate?: string,
    endDate?: string,
    page = 1,
    limit = 20,
  ) {
    const query: Record<string, any> = {};

    if (domain && domain !== "all") {
      query.domain = domain;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    if (search) {
      query.$or = [
        { userName: { $regex: search.trim(), $options: "i" } },
        { description: { $regex: search.trim(), $options: "i" } },
      ];
    }

    const result = await this.auditRepo.findByQuery(query, page, limit);
    const formattedLogs = result.logs.map((log: any) => ({
      id: log._id.toString(),
      userName: log.userName,
      action: log.action,
      domain: log.domain,
      description: log.description,
      ipAddress: log.ipAddress,
      timestamp: log.createdAt
        ? new Date(log.createdAt).toISOString().replace("T", " ").substring(0, 19)
        : "",
    }));
    return {
      logs: formattedLogs,
      pagination: {
        page: result.page,
        totalPages: result.totalPages,
        limit,
        total: result.total,
      }
    };
  }
}
