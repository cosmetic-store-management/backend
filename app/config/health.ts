import { Router } from "express";
import mongoose from "mongoose";
import os from "os";

const router = Router();

router.get("/", (_req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = dbState === 1 ? "connected" : "disconnected";
  const isHealthy = dbState === 1;

  const memTotal = os.totalmem();
  const memFree = os.freemem();
  const memUsedPct = Math.round(((memTotal - memFree) / memTotal) * 100);

  // Memory warning: degrade if >90% used
  const memHealthy = memUsedPct < 90;
  const overall = isHealthy && memHealthy ? "ok" : "degraded";

  res.status(isHealthy ? 200 : 503).json({
    status: overall,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    version: process.env.npm_package_version ?? "unknown",
    services: {
      database: dbStatus,
      memory: {
        status: memHealthy ? "ok" : "high",
        usedPct: memUsedPct,
        totalMb: Math.round(memTotal / 1024 / 1024),
        freeMb: Math.round(memFree / 1024 / 1024),
      },
    },
  });
});

export default router;
