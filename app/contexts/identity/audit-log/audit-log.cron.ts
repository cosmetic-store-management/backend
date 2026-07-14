import fs from "fs";
import path from "path";
import { container } from "tsyringe";
import { AuditLogRepository } from "./audit-log.repository.js";
import { logger } from "../../../shared/logger/index.js";

// Chạy cronjob định kỳ 1 lần mỗi ngày (24 giờ)
const CRON_INTERVAL = 24 * 60 * 60 * 1000;
// Thời hạn giữ log trong Database: 3 tháng
const RETENTION_MONTHS = 3;

export const startAuditLogArchiverCron = () => {
  let isRunning = false;

  setInterval(async () => {
    if (isRunning) {
      logger.info("[AuditLog Cron] Previous process is running, skipping...");
      return;
    }

    isRunning = true;
    try {
      const expirationDate = new Date();
      expirationDate.setMonth(expirationDate.getMonth() - RETENTION_MONTHS);

      // Kiểm tra có log cũ không
      const auditLogRepo = container.resolve(AuditLogRepository);
      const oldLogsCount = await auditLogRepo.countLogsBefore(expirationDate);
      if (oldLogsCount === 0) {
        isRunning = false;
        return;
      }

      logger.info(`[AuditLog Cron] Tìm thấy ${oldLogsCount} logs quá hạn (> ${RETENTION_MONTHS} tháng). Tiến hành Archive...`);

      // Lấy toàn bộ log cũ theo từng chunk (tránh RAM overload nếu quá nhiều)
      const logsToArchive = await auditLogRepo.findLogsBefore(expirationDate);

      // Tạo thư mục backup nếu chưa có
      const backupDir = path.resolve(process.cwd(), "backups", "audit_logs");
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      // Tạo tên file backup theo thời gian
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupFilePath = path.join(backupDir, `audit-logs-archive-${timestamp}.json`);

      // Ghi ra file
      fs.writeFileSync(backupFilePath, JSON.stringify(logsToArchive, null, 2), "utf8");
      logger.info(`[AuditLog Cron] Đã lưu ${oldLogsCount} logs vào file backup: ${backupFilePath}`);

      // Xoá log cũ khỏi DB sau khi đã backup thành công
      const deleteResult = await auditLogRepo.deleteLogsBefore(expirationDate);
      logger.info(`[AuditLog Cron] Đã dọn dẹp thành công ${deleteResult.deletedCount} logs khỏi cơ sở dữ liệu.`);

    } catch (error) {
      logger.error({ err: error }, "[AuditLog Cron] Error while archiving Audit Logs:");
    } finally {
      isRunning = false;
    }
  }, CRON_INTERVAL);

  logger.info(`[AuditLog Cron] Đã khởi chạy cron dọn dẹp Audit Logs cũ (Chu kỳ: 1 ngày, Retention: ${RETENTION_MONTHS} tháng)`);
};
