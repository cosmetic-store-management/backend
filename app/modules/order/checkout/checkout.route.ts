import { Router } from "express";
import { authenticate, authorize } from "../../../middlewares/auth.middleware.js";
import { validate } from "../../../middlewares/validate.middleware.js";
import { CreateOrderSchema, PreviewOrderSchema } from "../dto/order.request.dto.js";
import { container } from "tsyringe";
import { CheckoutController } from "./checkout.controller.js";

const router = Router();
const controller = container.resolve(CheckoutController);

router.post("/preview", validate(PreviewOrderSchema), controller.postPreview);
router.post("/", authenticate, validate(CreateOrderSchema), controller.postRoot);
router.post("/pos", authenticate, authorize("owner", "manager", "staff"), controller.postPos);
router.patch("/:code/cancel", controller.patchCodeCancel);

export default router;
