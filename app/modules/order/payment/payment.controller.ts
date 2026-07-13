import { Request, Response } from "express";

import * as paymentService from "./payment.service.js";

import { catchAsync } from "../../../shared/helpers/catchAsync.js";

export const createPaymentIntent = catchAsync(async (
  req: Request,
  res: Response,
) => {
  const { orderId } = req.body;
  const result = await paymentService.createStripePaymentIntent(orderId);
  res.json({ success: true, ...result });
});

export const stripeWebhook = catchAsync(async (
  req: Request,
  res: Response,
) => {
  const sig = req.headers["stripe-signature"] as string;
  await paymentService.handleStripeWebhook(req.body, sig);
  res.json({ received: true });
});

export const sepayWebhook = catchAsync(async (
  req: Request,
  res: Response,
) => {
  const authHeader = req.headers.authorization || "";
  await paymentService.handleSepayWebhook(req.body, authHeader);
  res.json({ success: true });
});

export const payosWebhook = catchAsync(async (
  req: Request,
  res: Response,
) => {
  const signatureHeader = req.headers["x-signature"] as string || "";
  await paymentService.handlePayosWebhook(req.body, signatureHeader);
  res.json({ success: true });
});

export const lookupAccount = catchAsync(async (
  req: Request,
  res: Response,
) => {
  const { bin, accountNumber } = req.body;
  if (!bin || !accountNumber) {
    return res.status(400).json({ success: false, message: "Thiếu bin hoặc accountNumber" });
  }
  const result = await paymentService.lookupBankAccount(bin, accountNumber);
  res.json({ success: true, ...result });
});


export const postCreateIntent = createPaymentIntent;

export const postWebhookSepay = sepayWebhook;

export const postWebhookPayos = payosWebhook;

export const postLookupAccount = lookupAccount;