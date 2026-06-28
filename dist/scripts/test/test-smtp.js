import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
// Resolve __dirname manually for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Ensure we load variables from the root backend .env
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
import { sendWelcomeEmail } from "../../app/shared/email/email.service.js";
async function testSMTP() {
    console.log("Using SMTP_HOST:", process.env.SMTP_HOST);
    console.log("Using SMTP_USER:", process.env.SMTP_USER);
    try {
        await sendWelcomeEmail(process.env.SMTP_USER, "Thanh");
        console.log("Email sent successfully!");
        process.exit(0);
    }
    catch (error) {
        console.error("Failed to send email:", error);
        process.exit(1);
    }
}
testSMTP();
