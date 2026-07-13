import { Router } from "express";
import { validate } from "../../middlewares/validate.middleware.js";
import { createFlashSaleSchema } from "./dto/flash-sale.request.dto.js";
import { container } from "tsyringe";
import { FlashSaleController } from "./flash-sale.controller.js";

const router = Router();
const controller = container.resolve(FlashSaleController);

router.get("/active", controller.getActive);
router.get("/timeline", controller.getTimeline);
router.get("/", controller.getRoot);
router.post("/", validate(createFlashSaleSchema), controller.postRoot);
router.get("/:id", controller.getId);
router.put("/:id", validate(createFlashSaleSchema), controller.putId);
router.delete("/:id", controller.deleteId);

export default router;
