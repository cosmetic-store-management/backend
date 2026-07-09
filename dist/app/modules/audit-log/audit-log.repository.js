/**
 * audit-log.repository.ts
 * Data access layer cho Audit Log module.
 * Tách biệt DB operations khỏi business logic theo chuẩn 3-tier.
 */
import AuditLog from "./models/audit-log.schema.js";
// ── Write ─────────────────────────────────────────────────────────────────────
export const createLog = (data) => AuditLog.create(data);
// ── Read ──────────────────────────────────────────────────────────────────────
export const findByQuery = async (query, page, limit) => {
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
        AuditLog.find(query).sort({ _id: -1 }).skip(skip).limit(limit).lean(),
        AuditLog.countDocuments(query),
    ]);
    const totalPages = Math.ceil(total / limit);
    return { logs, total, limit, page, totalPages };
};
