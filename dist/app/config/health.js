import { Router } from "express";
import mongoose from "mongoose";
const router = Router();
router.get("/", (_req, res) => {
    const dbState = mongoose.connection.readyState;
    const dbStatus = dbState === 1 ? "connected" : "disconnected";
    const isHealthy = dbState === 1;
    res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? "ok" : "degraded",
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        services: { database: dbStatus },
    });
});
export default router;
