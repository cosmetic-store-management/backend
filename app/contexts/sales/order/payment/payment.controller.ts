import { Request, Response } from "express";
import { PaymentService } from "./payment.service.js";
import { catchAsync } from "../../../../shared/helpers/catchAsync.js";
import { injectable, inject } from "tsyringe";

@injectable()
export class PaymentController {
  constructor(@inject(PaymentService) private readonly paymentService: PaymentService) {}

  createPaymentIntent = catchAsync(async (req: Request, res: Response) => {
    const { orderId } = req.body;
    const result = await this.paymentService.createStripePaymentIntent(orderId);
    res.json({ success: true, ...result });
  });

  stripeWebhook = catchAsync(async (req: Request, res: Response) => {
    const sig = req.headers["stripe-signature"] as string;
    await this.paymentService.handleStripeWebhook(req.body, sig);
    res.json({ received: true });
  });

  sepayWebhook = catchAsync(async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization || "";
    await this.paymentService.handleSepayWebhook(req.body, authHeader);
    res.json({ success: true });
  });

  payosWebhook = catchAsync(async (req: Request, res: Response) => {
    const signatureHeader = req.headers["x-signature"] as string || "";
    await this.paymentService.handlePayosWebhook(req.body, signatureHeader);
    res.json({ success: true });
  });

  lookupAccount = catchAsync(async (req: Request, res: Response) => {
    const { bin, accountNumber } = req.body;
    if (!bin || !accountNumber) {
      return res.status(400).json({ success: false, message: "Thiếu bin hoặc accountNumber" });
    }
    const result = await this.paymentService.lookupBankAccount(bin, accountNumber);
    res.json({ success: true, ...result });
  });
}