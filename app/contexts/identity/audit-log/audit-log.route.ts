import { Router } from "express";
import { authenticate, isOwner } from "../../../middlewares/auth.middleware.js";
import { container } from "tsyringe";
import { AuditLogController } from "./audit-log.controller.js";

const router = Router();
const controller = container.resolve(AuditLogController);

router.get("/", authenticate, isOwner, controller.getRoot);

export default router;
