import { Request, Response } from "express";

import * as checkoutService from "./checkout.service.js";

import { catchAsync } from "../../../shared/helpers/catchAsync.js";




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

import { abandonPendingOrder } from "../order.service.js";

export const postPreview = previewOrderHandler;

export const postRoot = createOrderHandler;

export const postPos = createPOSOrderHandler;

export const patchCodeCancel = catchAsync(async (req: Request, res: Response) => {
  const { code } = req.params;
  const result = await abandonPendingOrder(code as string);
  res.json({ success: true, data: result, message: "Hủy mã QR thành công" });
});