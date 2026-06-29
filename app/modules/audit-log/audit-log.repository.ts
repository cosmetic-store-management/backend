/**
 * audit-log.repository.ts
 * Data access layer cho Audit Log module.
 * Tách biệt DB operations khỏi business logic theo chuẩn 3-tier.
 */
import AuditLog, {
  type AuditLogDocument,
} from "./models/audit-log.schema.js";

// ── Write ─────────────────────────────────────────────────────────────────────

export const createLog = (data: {
  userId?: string;
  userName: string;
  action:
    | "create"
    | "update"
    | "delete"
    | "login"
    | "logout"
    | "import"
    | "checkout"
    | "export";
  domain:
    | "identity"
    | "catalog"
    | "inventory"
    | "sales"
    | "settings"
    | "system";
  description: string;
  ipAddress: string;
}): Promise<AuditLogDocument> => AuditLog.create(data);

// ── Read ──────────────────────────────────────────────────────────────────────

export const findByQuery = async (
  query: Record<string, any>,
  page: number,
  limit: number,
) => {
  const skip = (page - 1) * limit;
  const [logs, total] = await Promise.all([
    AuditLog.find(query).sort({ _id: -1 }).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments(query),
  ]);
  
  const totalPages = Math.ceil(total / limit);
  
  return { logs, total, limit, page, totalPages };
};
