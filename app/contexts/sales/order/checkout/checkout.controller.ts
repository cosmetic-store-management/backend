import { Request, Response } from "express";
import { injectable, inject } from "tsyringe";
import { CheckoutService } from "./checkout.service.js";
import { OrderService } from "../order.service.js";
import { catchAsync } from "../../../../shared/helpers/catchAsync.js";

@injectable()
export class CheckoutController {
  constructor(
    @inject(CheckoutService) private readonly checkoutService: CheckoutService,
    @inject(OrderService) private readonly orderService: OrderService
  ) {}

  postPreview = catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user || null;
    const result = await this.checkoutService.previewOrder(user, req.body);
    res.json({ success: true, data: result });
  });

  postRoot = catchAsync(async (req: Request, res: Response) => {
    const user = (req as any).user;
    const result = await this.checkoutService.createOrder(user, req.body);
    res.status(201).json({ success: true, data: result });
  });

  postPos = catchAsync(async (req: Request, res: Response) => {
    const operator = (req as any).user;
    const result = await this.checkoutService.createPOSOrder(operator, req.body);
    res.status(201).json({ success: true, data: result });
  });

  patchCodeCancel = catchAsync(async (req: Request, res: Response) => {
    const { code } = req.params;
    const result = await this.orderService.abandonPendingOrder(code as string);
    res.json({ success: true, data: result, message: "Hủy mã QR thành công" });
  });
}