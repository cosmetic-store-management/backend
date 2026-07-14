import pino from "pino";

const isDevelopment = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: isDevelopment ? "debug" : "info",
  redact: {
    paths: ["password", "oldPassword", "newPassword", "token", "accessToken", "refreshToken", "req.headers.authorization", "req.headers.cookie"],
    censor: "[REDACTED]",
  },
  transport: isDevelopment
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined,
});
