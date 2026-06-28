import { Router, Request, Response } from "express";
import * as checkoutService from "./checkout.service.js";
import { catchAsync } from "../../../shared/helpers/catchAsync.js";
import {
  authenticate,
  authorize,
} from "../../../middlewares/auth.middleware.js";
import { validate } from "../../../middlewares/validate.middleware.js";
import {
  CreateOrderSchema,
  PreviewOrderSchema,
} from "../dto/order.request.dto.js";

const router = Router();

export const previewOrderHandler = catchAsync(async (
  req: Request,
  res: Response,
) => {
  const user = (req as any).user || null;
  const result = await checkoutService.previewOrder(user, req.body);
  res.json({ success: true, data: result });
});

export const createOrderHandler = catchAsync(async (
  req: Request,
  res: Response,
) => {
  const user = (req as any).user;
  const result = await checkoutService.createOrder(user, req.body);
  res.status(201).json({ success: true, data: result });
});

export const createPOSOrderHandler = catchAsync(async (
  req: Request,
  res: Response,
) => {
  const operator = (req as any).user;
  const result = await checkoutService.createPOSOrder(operator, req.body);
  res.status(201).json({ success: true, data: result });
});

router.post("/preview", validate(PreviewOrderSchema), previewOrderHandler);
router.post("/", authenticate, validate(CreateOrderSchema), createOrderHandler);
router.post(
  "/pos",
  authenticate,
  authorize("owner", "manager", "staff"),
  createPOSOrderHandler,
);

import { abandonPendingOrder } from "../order.service.js";

router.patch("/:code/cancel", catchAsync(async (req: Request, res: Response) => {
  const { code } = req.params;
  const result = await abandonPendingOrder(code);
  res.json({ success: true, data: result, message: "Hủy mã QR thành công" });
}));

export default router;
