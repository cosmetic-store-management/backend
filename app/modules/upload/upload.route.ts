import { Router } from "express";
import { authenticate, isStaff } from "../../middlewares/auth.middleware.js";
import { container } from "tsyringe";
import { UploadController, uploadMediaMiddleware } from "./upload.controller.js";

const router = Router();
const controller = container.resolve(UploadController);

router.get("/:filename", controller.getFilename);
router.post("/", authenticate, isStaff, controller.postRoot);
router.post("/media", authenticate, uploadMediaMiddleware, controller.postMedia);

export default router;
