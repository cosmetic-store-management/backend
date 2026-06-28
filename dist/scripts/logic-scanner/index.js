import { Project } from "ts-morph";
import path from "path";
import fs from "fs";
async function runScanner() {
    console.log("🚀 Bắt đầu Logic & Business Scanner...\n");
    const project = new Project({
        tsConfigFilePath: path.join(process.cwd(), "tsconfig.json"),
    });
    const sourceFiles = project.getSourceFiles("app/modules/**/*.ts");
    console.log(`Đã nạp ${sourceFiles.length} files để phân tích.`);
    // Load rules
    const rulesDir = path.join(import.meta.dirname, "rules");
    const ruleFiles = fs.readdirSync(rulesDir).filter((f) => f.endsWith(".ts") || f.endsWith(".js"));
    const rules = [];
    for (const file of ruleFiles) {
        const ruleModule = await import(`./rules/${file}`);
        if (ruleModule.default) {
            rules.push(ruleModule.default);
        }
    }
    console.log(`Đã nạp ${rules.length} rules.\n`);
    let totalIssues = 0;
    let hasErrors = false;
    for (const sourceFile of sourceFiles) {
        for (const rule of rules) {
            try {
                const issues = rule.run(sourceFile);
                if (issues.length > 0) {
                    console.log(`\n📄 File: ${sourceFile.getFilePath()}`);
                    console.log(`🛡️  Rule vi phạm: ${rule.name}`);
                    issues.forEach((issue) => {
                        const prefix = issue.severity === "error" ? "❌ ERROR" : "⚠️ WARNING";
                        console.log(`   ${prefix} (Line ${issue.line}): ${issue.message}`);
                        totalIssues++;
                        if (issue.severity === "error")
                            hasErrors = true;
                    });
                }
            }
            catch (err) {
                console.error(`Lỗi khi chạy rule ${rule.name} trên file ${sourceFile.getFilePath()}:`, err);
            }
        }
    }
    console.log(`\n==============================================`);
    console.log(`✅ Quá trình quét hoàn tất.`);
    console.log(`📊 Tổng số vấn đề: ${totalIssues}`);
    if (hasErrors) {
        console.error("❌ Có lỗi nghiêm trọng (ERROR) được tìm thấy. Vui lòng kiểm tra lại code.");
        process.exit(1);
    }
}
runScanner().catch(console.error);
