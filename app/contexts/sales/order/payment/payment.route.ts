import { Router } from "express";
import { authenticate, requirePermission } from "../../../../middlewares/auth.middleware.js";
import * as controller from "./payment.controller.js";
const router = Router();
router.post("/create-intent", controller.postCreateIntent);
router.post("/webhook/sepay", controller.postWebhookSepay);
router.post("/webhook/payos", controller.postWebhookPayos);
router.post("/lookup-account", authenticate, requirePermission("orders.manage"), controller.postLookupAccount);

export default router;

