/**
 * audit-log.repository.ts
 * Data access layer cho Audit Log module.
 * Tách biệt DB operations khỏi business logic theo chuẩn 3-tier.
 */
import AuditLog from "../../models/system/audit-log.schema.js";
// ── Write ─────────────────────────────────────────────────────────────────────
export const createLog = (data) => AuditLog.create(data);
// ── Read ──────────────────────────────────────────────────────────────────────
export const findByQuery = async (query, cursor, limit) => {
    if (cursor)
        query._id = { $lt: cursor };
    const logs = await AuditLog.find(query).sort({ _id: -1 }).limit(limit + 1).lean();
    const hasNextPage = logs.length > limit;
    const items = hasNextPage ? logs.slice(0, limit) : logs;
    const nextCursor = hasNextPage ? items[items.length - 1]._id.toString() : null;
    return { logs: items, nextCursor, hasNextPage, limit };
};
