import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
// Load env
dotenv.config({ path: path.join(process.cwd(), ".env") });
async function runAuditor() {
    console.log("🚀 Bắt đầu Database & State Auditor...\n");
    if (!process.env.MONGODB_URI) {
        console.error("❌ Không tìm thấy MONGODB_URI trong .env");
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Đã kết nối MongoDB.");
    // Load checks
    const checksDir = path.join(import.meta.dirname, "checks");
    const checkFiles = fs.readdirSync(checksDir).filter((f) => f.endsWith(".ts") || f.endsWith(".js"));
    const checks = [];
    for (const file of checkFiles) {
        const checkModule = await import(`./checks/${file}`);
        if (checkModule.default) {
            checks.push(checkModule.default);
        }
    }
    console.log(`Đã nạp ${checks.length} bài kiểm tra dữ liệu.\n`);
    let totalIssues = 0;
    let hasErrors = false;
    for (const check of checks) {
        try {
            console.log(`⏳ Đang chạy: ${check.name}...`);
            const issues = await check.run();
            if (issues.length > 0) {
                console.log(`🛡️  Phát hiện vấn đề từ: ${check.name}`);
                issues.forEach((issue) => {
                    const prefix = issue.severity === "error" ? "❌ ERROR" : "⚠️ WARNING";
                    console.log(`   ${prefix}: ${issue.message}`);
                    if (issue.data) {
                        console.log(`      Data: ${JSON.stringify(issue.data)}`);
                    }
                    totalIssues++;
                    if (issue.severity === "error")
                        hasErrors = true;
                });
            }
            else {
                console.log(`   ✅ OK`);
            }
        }
        catch (err) {
            console.error(`Lỗi khi chạy check ${check.name}:`, err);
        }
    }
    await mongoose.disconnect();
    console.log(`\n==============================================`);
    console.log(`✅ Quá trình kiểm toán dữ liệu hoàn tất.`);
    console.log(`📊 Tổng số điểm bất thường: ${totalIssues}`);
    if (hasErrors) {
        console.error("❌ Có dữ liệu lỗi nghiêm trọng (ERROR) được tìm thấy. Cần xử lý data fix scripts.");
        process.exit(1);
    }
}
runAuditor().catch(console.error);
