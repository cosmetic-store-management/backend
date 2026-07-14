import { Router } from "express";
import { authenticate, requirePermission } from "../../../../middlewares/auth.middleware.js";
import { PaymentController } from "./payment.controller.js";
import { container } from "tsyringe";

const router = Router();
const controller = container.resolve(PaymentController);

router.post("/create-intent", controller.createPaymentIntent.bind(controller));
router.post("/webhook/sepay", controller.sepayWebhook.bind(controller));
router.post("/webhook/payos", controller.payosWebhook.bind(controller));
router.post("/lookup-account", authenticate, requirePermission("orders.manage"), controller.lookupAccount.bind(controller));

export default router;
