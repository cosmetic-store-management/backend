/**
 * audit-log.repository.ts
 * Data access layer cho Audit Log module.
 * Tách biệt DB operations khỏi business logic theo chuẩn 3-tier.
 */
import AuditLog from "../../models/audit-log.schema.js";
// ── Write ─────────────────────────────────────────────────────────────────────
export const createLog = (data) => AuditLog.create(data);
// ── Read ──────────────────────────────────────────────────────────────────────
export const findByQuery = (query, limit = 100) => AuditLog.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
