import { logger } from "../shared/logger/index.js";
const REQUIRED_VARS = [
    "MONGODB_URI",
    "JWT_SECRET",
    "JWT_EXPIRES_IN",
    "JWT_REFRESH_EXPIRES_IN",
    "CORS_ORIGIN",
    "SMTP_USER",
    "SMTP_PASS",
];
export function validateEnv() {
    const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        logger.error(`❌ Missing required env vars: ${missing.join(", ")}`);
        process.exit(1);
    }
    logger.info("✅ Env variables OK");
}
