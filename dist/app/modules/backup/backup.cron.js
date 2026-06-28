import cron from "node-cron";
import { exec } from "child_process";
import path from "path";
import fs from "fs";
import { promisify } from "util";
import { fileURLToPath } from "url";
const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
/**
 * Lên lịch Backup Database hằng ngày vào lúc 2:00 sáng
 */
export function initBackupCron() {
    cron.schedule("0 2 * * *", async () => {
        console.log("⏳ [Cron] Bắt đầu tự động Backup MongoDB...");
        try {
            const backupDir = path.resolve(__dirname, "../../../../backups");
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }
            const dateStr = new Date().toISOString().replace(/[:.]/g, "-");
            const backupPath = path.join(backupDir, `backup-${dateStr}`);
            // Lấy URI từ biến môi trường
            const mongoUri = process.env.MONGODB_URI;
            if (!mongoUri) {
                throw new Error("MONGODB_URI không tồn tại.");
            }
            // Chạy lệnh mongodump
            const command = `mongodump --uri="${mongoUri}" --out="${backupPath}"`;
            await execAsync(command);
            // Nén thư mục backup lại
            const zipCommand = `tar -czvf "${backupPath}.tar.gz" -C "${backupDir}" "backup-${dateStr}"`;
            await execAsync(zipCommand);
            // Xóa thư mục gốc sau khi nén
            fs.rmSync(backupPath, { recursive: true, force: true });
            console.log(`✅ [Cron] Backup thành công: ${backupPath}.tar.gz`);
            // Dọn dẹp backup cũ hơn 7 ngày
            cleanupOldBackups(backupDir);
        }
        catch (error) {
            console.error("❌ [Cron] Lỗi Backup Database:", error);
        }
    });
    console.log("✅ [Cron] Đã đăng ký tác vụ Backup Database (02:00 hàng ngày)");
}
function cleanupOldBackups(backupDir) {
    try {
        const files = fs.readdirSync(backupDir);
        const now = Date.now();
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        let deletedCount = 0;
        for (const file of files) {
            const filePath = path.join(backupDir, file);
            const stat = fs.statSync(filePath);
            if (now - stat.mtimeMs > SEVEN_DAYS_MS) {
                fs.unlinkSync(filePath);
                deletedCount++;
            }
        }
        if (deletedCount > 0) {
            console.log(`🧹 [Cron] Đã dọn dẹp ${deletedCount} file backup cũ.`);
        }
    }
    catch (error) {
        console.error("❌ [Cron] Lỗi dọn dẹp file backup cũ:", error);
    }
}
