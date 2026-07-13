import { Router } from "express";
import { authenticate } from "../../../../middlewares/auth.middleware.js";
import * as controller from "./transaction.controller.js";
const router = Router();
router.get("/order/:orderId", authenticate, controller.getOrderOrderId);

export default router;

