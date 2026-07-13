import { Router } from "express";
import { authenticate, isOwner } from "../../middlewares/auth.middleware.js";
import * as controller from "./audit-log.controller.js";
const router = Router();
router.get("/", authenticate, isOwner, controller.getRoot);

export default router;

