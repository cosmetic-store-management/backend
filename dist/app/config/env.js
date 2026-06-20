const REQUIRED_VARS = [
    "MONGODB_URI",
    "JWT_SECRET",
    "JWT_EXPIRES_IN",
    "CORS_ORIGIN",
];
export function validateEnv() {
    const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        console.error(`❌ Missing required env vars: ${missing.join(", ")}`);
        process.exit(1);
    }
    console.log("✅ Env variables OK");
}
