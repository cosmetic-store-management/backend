import { Router } from "express";
import { container } from "tsyringe";
import { authenticate } from "../../../../middlewares/auth.middleware.js";
import { TransactionController } from "./transaction.controller.js";

const router = Router();
const controller = container.resolve(TransactionController);

router.get("/order/:orderId", authenticate, controller.getOrderOrderId.bind(controller));

export default router;
