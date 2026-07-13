import { injectable } from "tsyringe";
import AuditLog, { type AuditLogDocument } from "./models/audit-log.schema.js";

@injectable()
export class AuditLogRepository {
  createLog(data: {
    userId?: string;
    userName: string;
    action: "create" | "update" | "delete" | "login" | "logout" | "import" | "checkout" | "export";
    domain: "identity" | "catalog" | "inventory" | "sales" | "settings" | "system";
    description: string;
    ipAddress: string;
  }): Promise<AuditLogDocument> {
    return AuditLog.create(data);
  }

  async findByQuery(query: Record<string, any>, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      AuditLog.find(query).sort({ _id: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(query),
    ]);
    
    const totalPages = Math.ceil(total / limit);
    
    return { logs, total, limit, page, totalPages };
  }
}
