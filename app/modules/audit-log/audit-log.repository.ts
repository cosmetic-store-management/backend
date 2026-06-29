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
  cursor: string | null,
  limit: number,
) => {
  if (cursor) query._id = { $lt: cursor };
  const logs = await AuditLog.find(query).sort({ _id: -1 }).limit(limit + 1).lean();
  
  const hasNextPage = logs.length > limit;
  const items = hasNextPage ? logs.slice(0, limit) : logs;
  const nextCursor = hasNextPage ? items[items.length - 1]._id.toString() : null;
  
  return { logs: items, nextCursor, hasNextPage, limit };
};
