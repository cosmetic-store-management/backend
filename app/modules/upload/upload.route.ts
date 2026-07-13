import { Router } from "express";
import { authenticate, isStaff } from "../../middlewares/auth.middleware.js";
import * as controller from "./upload.controller.js";
const router = Router();
router.get("/:filename", controller.getFilename);
router.post("/", authenticate, isStaff, controller.postRoot);
router.post("/media", authenticate, controller.uploadMediaMiddleware, controller.postMedia);

export default router;

