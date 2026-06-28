/**
 * audit-log.service.test.ts — Unit tests cho Audit Log Service
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../app/modules/audit-log/audit-log.repository.js");

import * as auditRepo from "../../app/modules/audit-log/audit-log.repository.js";
import * as auditService from "../../app/modules/audit-log/audit-log.service.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("auditLogService.logAction", () => {
  it("gọi repository để tạo log thành công", async () => {
    vi.mocked(auditRepo.createLog).mockResolvedValue({} as any);

    await auditService.logAction(
      "user123",
      "Admin",
      "create",
      "inventory",
      "Tạo sản phẩm",
      "192.168.1.1"
    );

    expect(auditRepo.createLog).toHaveBeenCalledWith({
      userId: "user123",
      userName: "Admin",
      action: "create",
      domain: "inventory",
      description: "Tạo sản phẩm",
      ipAddress: "192.168.1.1"
    });
  });

  it("không throw error nếu repository bị lỗi (fire-and-forget)", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(auditRepo.createLog).mockRejectedValue(new Error("DB Error"));

    await expect(
      auditService.logAction("user123", "Admin", "create", "inventory", "Desc", "1.1.1.1")
    ).resolves.not.toThrow();
    
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

describe("auditLogService.getAuditLogs", () => {
  it("trả về danh sách logs và format đúng ngày tháng", async () => {
    vi.mocked(auditRepo.findByQuery).mockResolvedValue([
      {
        _id: "log1",
        userName: "Admin",
        action: "update",
        domain: "settings",
        description: "Cập nhật lợi nhuận",
        ipAddress: "127.0.0.1",
        createdAt: new Date("2026-06-23T15:00:00.000Z")
      }
    ] as any);

    const result = await auditService.getAuditLogs("Admin", "settings");
    
    expect(auditRepo.findByQuery).toHaveBeenCalled();
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("log1");
    expect(result[0].timestamp).toBe("2026-06-23 15:00:00");
  });

  it("truyền đúng query lọc", async () => {
    vi.mocked(auditRepo.findByQuery).mockResolvedValue([]);

    await auditService.getAuditLogs("Test", "catalog", "2026-06-20", "2026-06-21");

    const queryArg = vi.mocked(auditRepo.findByQuery).mock.calls[0][0];
    expect(queryArg.domain).toBe("catalog");
    expect(queryArg.createdAt.$gte).toBeInstanceOf(Date);
    expect(queryArg.createdAt.$lte).toBeInstanceOf(Date);
    expect(queryArg.$or).toBeDefined();
  });
});
