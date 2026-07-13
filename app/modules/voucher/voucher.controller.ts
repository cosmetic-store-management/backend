
import * as voucherService from "./voucher.service.js";




import * as response from "../../shared/helpers/response.js";

import { catchAsync } from "../../shared/helpers/catchAsync.js";

export const getAdmin = catchAsync(async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as string;
    const type = req.query.type as string;
    const search = req.query.search as string;
    
    const { items: vouchers, pagination } = await voucherService.getAllVouchers(
      { status, type, search },
      page,
      limit
    );
    return response.success(res, {
      vouchers,
      pagination,
      message: "Voucher list fetched successfully",
    });
  });

export const postAdmin = catchAsync(async (req, res) => {
    const voucher = await voucherService.createVoucher(req.body);
    return response.created(res, {
      voucher,
      message: "Voucher created successfully",
    });
  });

export const putAdminId = catchAsync(async (req, res) => {
    const voucher = await voucherService.updateVoucher(
      req.params.id as string,
      req.body,
    );
    return response.success(res, {
      voucher,
      message: "Voucher updated successfully",
    });
  });

export const deleteAdminId = catchAsync(async (req, res) => {
    await voucherService.deleteVoucher(req.params.id as string);
    return response.success(res, { message: "Voucher deleted successfully" });
  });

export const getPublic = catchAsync(async (_req, res) => {
    const { items: vouchers } = await voucherService.getAllVouchers(false);
    return response.success(res, {
      vouchers,
      message: "Available vouchers fetched successfully",
    });
  });

export const getWallet = catchAsync(async (req, res) => {
    const vouchers = await voucherService.getWalletVouchers(
      req.user!._id.toString(),
    );
    return response.success(res, {
      vouchers,
      message: "Voucher wallet fetched successfully",
    });
  });

export const getWalletAll = catchAsync(async (req, res) => {
    const vouchers = await voucherService.getAllWalletVouchers(
      req.user!._id.toString(),
    );
    return response.success(res, {
      vouchers,
      message: "Full voucher wallet fetched successfully",
    });
  });

export const postValidate = catchAsync(async (req, res) => {
    const { code, subtotal } = req.body;
    const result = await voucherService.validateVoucher(
      code,
      subtotal,
      30000,
      req.user?._id?.toString(),
    );
    return response.success(res, { result, message: "Voucher is valid" });
  });

export const postCollectCode = catchAsync(async (req, res) => {
    const voucher = await voucherService.collectVoucher(
      req.user!._id.toString(),
      req.params.code as string,
    );
    return response.created(res, {
      voucher,
      message: "Voucher saved to wallet",
    });
  });

export const deleteCollectCode = catchAsync(async (req, res) => {
    await voucherService.uncollectVoucher(
      req.user!._id.toString(),
      req.params.code as string,
    );
    return response.success(res, { message: "Voucher removed from wallet" });
  });