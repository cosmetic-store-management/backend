import * as auditRepo from "./audit-log.repository.js";
// ── Write ─────────────────────────────────────────────────────────────────────
export const logAction = async (userId, userName, action, domain, description, ipAddress) => {
    try {
        await auditRepo.createLog({
            userId,
            userName,
            action,
            domain,
            description,
            ipAddress: ipAddress || "127.0.0.1",
        });
    }
    catch (err) {
        console.error("Failed to write audit log:", err);
    }
};
// ── Read ──────────────────────────────────────────────────────────────────────
export const getAuditLogs = async (search, domain, startDate, endDate, cursor, limit = 20) => {
    const query = {};
    if (domain && domain !== "all") {
        query.domain = domain;
    }
    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate)
            query.createdAt.$gte = new Date(startDate);
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
    const result = await auditRepo.findByQuery(query, cursor || null, limit);
    const formattedLogs = result.logs.map((log) => ({
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
            nextCursor: result.nextCursor,
            hasNextPage: result.hasNextPage,
            limit,
        }
    };
};
