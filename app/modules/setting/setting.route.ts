import { Router } from "express";
import { authenticate, isOwner } from "../../middlewares/auth.middleware.js";
import * as controller from "./setting.controller.js";
const router = Router();
router.get("/public", controller.getPublic);
router.get("/public/stats", controller.getPublicStats);
router.get("/", authenticate, controller.getRoot);
router.put("/", authenticate, isOwner, controller.putRoot);

export default router;

