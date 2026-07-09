import { Router } from "express";
import * as voucherService from "./voucher.service.js";
import { CreateVoucherSchema, UpdateVoucherSchema, ValidateVoucherSchema, } from "./dto/voucher.request.dto.js";
import { authenticate, optionalAuth, isManager, isStaff, } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import * as response from "../../shared/helpers/response.js";
import { catchAsync } from "../../shared/helpers/catchAsync.js";
const router = Router();
// ── ADMIN ─────────────────────────────────────────────────────────────────────
router.get("/admin", authenticate, isStaff, catchAsync(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;
    const type = req.query.type;
    const search = req.query.search;
    const { items: vouchers, pagination } = await voucherService.getAllVouchers({ status, type, search }, page, limit);
    return response.success(res, {
        vouchers,
        pagination,
        message: "Voucher list fetched successfully",
    });
}));
router.post("/admin", authenticate, isManager, validate(CreateVoucherSchema), catchAsync(async (req, res) => {
    const voucher = await voucherService.createVoucher(req.body);
    return response.created(res, {
        voucher,
        message: "Voucher created successfully",
    });
}));
router.put("/admin/:id", authenticate, isManager, validate(UpdateVoucherSchema), catchAsync(async (req, res) => {
    const voucher = await voucherService.updateVoucher(req.params.id, req.body);
    return response.success(res, {
        voucher,
        message: "Voucher updated successfully",
    });
}));
router.delete("/admin/:id", authenticate, isManager, catchAsync(async (req, res) => {
    await voucherService.deleteVoucher(req.params.id);
    return response.success(res, { message: "Voucher deleted successfully" });
}));
// ── PUBLIC ────────────────────────────────────────────────────────────────────
router.get("/public", catchAsync(async (_req, res) => {
    const { items: vouchers } = await voucherService.getAllVouchers(false);
    return response.success(res, {
        vouchers,
        message: "Available vouchers fetched successfully",
    });
}));
router.get("/wallet", authenticate, catchAsync(async (req, res) => {
    const vouchers = await voucherService.getWalletVouchers(req.user._id.toString());
    return response.success(res, {
        vouchers,
        message: "Voucher wallet fetched successfully",
    });
}));
router.get("/wallet/all", authenticate, catchAsync(async (req, res) => {
    const vouchers = await voucherService.getAllWalletVouchers(req.user._id.toString());
    return response.success(res, {
        vouchers,
        message: "Full voucher wallet fetched successfully",
    });
}));
router.post("/validate", optionalAuth, validate(ValidateVoucherSchema), catchAsync(async (req, res) => {
    const { code, subtotal } = req.body;
    const result = await voucherService.validateVoucher(code, subtotal, 30000, req.user?._id?.toString());
    return response.success(res, { result, message: "Voucher is valid" });
}));
// ── COLLECT / UNCOLLECT ──────────────────────────────────────────────────────
router.post("/collect/:code", authenticate, catchAsync(async (req, res) => {
    const voucher = await voucherService.collectVoucher(req.user._id.toString(), req.params.code);
    return response.created(res, {
        voucher,
        message: "Voucher saved to wallet",
    });
}));
router.delete("/collect/:code", authenticate, catchAsync(async (req, res) => {
    await voucherService.uncollectVoucher(req.user._id.toString(), req.params.code);
    return response.success(res, { message: "Voucher removed from wallet" });
}));
export default router;
