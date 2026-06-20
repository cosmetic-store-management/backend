import { Router } from "express";
import * as voucherService from "./voucher.service.js";
import { CreateVoucherSchema, UpdateVoucherSchema, ValidateVoucherSchema } from "./dto/voucher.request.dto.js";
import { authenticate, optionalAuth, isManager, isStaff } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import * as response from "../../shared/helpers/response.js";
import { catchAsync } from "../../shared/helpers/catchAsync.js";
const router = Router();
// ── ADMIN ─────────────────────────────────────────────────────────────────────
router.get("/admin", authenticate, isStaff, catchAsync(async (req, res) => {
    const vouchers = await voucherService.getAllVouchers(true);
    return response.success(res, { vouchers, message: "Lấy danh sách mã giảm giá thành công" });
}));
router.post("/admin", authenticate, isManager, validate(CreateVoucherSchema), catchAsync(async (req, res) => {
    const voucher = await voucherService.createVoucher(req.body);
    return response.created(res, { voucher, message: "Tạo mã giảm giá thành công" });
}));
router.put("/admin/:id", authenticate, isManager, validate(UpdateVoucherSchema), catchAsync(async (req, res) => {
    const voucher = await voucherService.updateVoucher(req.params.id, req.body);
    return response.success(res, { voucher, message: "Cập nhật mã giảm giá thành công" });
}));
router.delete("/admin/:id", authenticate, isManager, catchAsync(async (req, res) => {
    await voucherService.deleteVoucher(req.params.id);
    return response.success(res, { message: "Xóa mã giảm giá thành công" });
}));
// ── PUBLIC ────────────────────────────────────────────────────────────────────
router.get("/public", catchAsync(async (req, res) => {
    const vouchers = await voucherService.getAllVouchers(false);
    return response.success(res, { vouchers, message: "Lấy danh sách mã giảm giá khả dụng thành công" });
}));
router.get("/wallet", authenticate, catchAsync(async (req, res) => {
    const vouchers = await voucherService.getWalletVouchers(req.user._id.toString());
    return response.success(res, { vouchers, message: "Lấy danh sách kho voucher thành công" });
}));
router.get("/wallet/all", authenticate, catchAsync(async (req, res) => {
    const vouchers = await voucherService.getAllWalletVouchers(req.user._id.toString());
    return response.success(res, { vouchers, message: "Lấy toàn bộ kho voucher thành công" });
}));
router.post("/validate", optionalAuth, validate(ValidateVoucherSchema), catchAsync(async (req, res) => {
    const { code, subtotal } = req.body;
    const result = await voucherService.validateVoucher(code, subtotal, 30000, req.user?._id?.toString());
    return response.success(res, { result, message: "Mã giảm giá hợp lệ" });
}));
// ── COLLECT / UNCOLLECT ──────────────────────────────────────────────────────
router.post("/collect/:code", authenticate, catchAsync(async (req, res) => {
    const voucher = await voucherService.collectVoucher(req.user._id.toString(), req.params.code);
    return response.created(res, { voucher, message: "Đã lưu mã giảm giá vào kho" });
}));
router.delete("/collect/:code", authenticate, catchAsync(async (req, res) => {
    await voucherService.uncollectVoucher(req.user._id.toString(), req.params.code);
    return response.success(res, { message: "Đã xóa mã giảm giá khỏi kho" });
}));
export default router;
