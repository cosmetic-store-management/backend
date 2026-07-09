import { Router } from "express";
import * as paymentService from "./payment.service.js";
import { catchAsync } from "../../../shared/helpers/catchAsync.js";
const router = Router();
export const createPaymentIntent = catchAsync(async (req, res) => {
    const { orderId } = req.body;
    const result = await paymentService.createStripePaymentIntent(orderId);
    res.json({ success: true, ...result });
});
export const stripeWebhook = catchAsync(async (req, res) => {
    const sig = req.headers["stripe-signature"];
    await paymentService.handleStripeWebhook(req.body, sig);
    res.json({ received: true });
});
export const sepayWebhook = catchAsync(async (req, res) => {
    const authHeader = req.headers.authorization || "";
    await paymentService.handleSepayWebhook(req.body, authHeader);
    res.json({ success: true });
});
export const payosWebhook = catchAsync(async (req, res) => {
    const signatureHeader = req.headers["x-signature"] || "";
    await paymentService.handlePayosWebhook(req.body, signatureHeader);
    res.json({ success: true });
});
export const lookupAccount = catchAsync(async (req, res) => {
    const { bin, accountNumber } = req.body;
    if (!bin || !accountNumber) {
        return res.status(400).json({ success: false, message: "Thiếu bin hoặc accountNumber" });
    }
    const result = await paymentService.lookupBankAccount(bin, accountNumber);
    res.json({ success: true, ...result });
});
router.post("/create-intent", createPaymentIntent);
router.post("/webhook/sepay", sepayWebhook);
router.post("/webhook/payos", payosWebhook);
import { authenticate, requirePermission } from "../../../middlewares/auth.middleware.js";
router.post("/lookup-account", authenticate, requirePermission("orders.manage"), lookupAccount);
// Webhook endpoint is mounted globally in server.ts to parse raw body
export default router;
