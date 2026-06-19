/**
 * audit-log.repository.ts
 * Data access layer cho Audit Log module.
 * Tách biệt DB operations khỏi business logic theo chuẩn 3-tier.
 */
import AuditLog, { type AuditLogDocument } from "../../models/audit-log.schema.js";

// ── Write ─────────────────────────────────────────────────────────────────────

export const createLog = (data: {
  userId?:     string;
  userName:    string;
  action:      "create" | "update" | "delete" | "login" | "logout" | "import" | "checkout" | "export";
  domain:      "identity" | "catalog" | "inventory" | "sales" | "settings" | "system";
  description: string;
  ipAddress:   string;
}): Promise<AuditLogDocument> =>
  AuditLog.create(data);

// ── Read ──────────────────────────────────────────────────────────────────────

export const findByQuery = (
  query: Record<string, any>,
  limit = 100
): Promise<AuditLogDocument[]> =>
  AuditLog.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean() as any;
