import { injectable, inject } from "tsyringe";
import { VoucherService } from "./voucher.service.js";
import * as response from "../../shared/helpers/response.js";
import { catchAsync } from "../../shared/helpers/catchAsync.js";

@injectable()
export class VoucherController {
  constructor(
    @inject(VoucherService) private readonly voucherService: VoucherService
  ) {}

  getAdmin = catchAsync(async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as string;
    const type = req.query.type as string;
    const search = req.query.search as string;
    
    const { items: vouchers, pagination } = await this.voucherService.getAllVouchers(
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

  postAdmin = catchAsync(async (req, res) => {
    const voucher = await this.voucherService.createVoucher(req.body);
    return response.created(res, {
      voucher,
      message: "Voucher created successfully",
    });
  });

  putAdminId = catchAsync(async (req, res) => {
    const voucher = await this.voucherService.updateVoucher(
      req.params.id as string,
      req.body,
    );
    return response.success(res, {
      voucher,
      message: "Voucher updated successfully",
    });
  });

  deleteAdminId = catchAsync(async (req, res) => {
    await this.voucherService.deleteVoucher(req.params.id as string);
    return response.success(res, { message: "Voucher deleted successfully" });
  });

  getPublic = catchAsync(async (_req, res) => {
    const { items: vouchers } = await this.voucherService.getAllVouchers(false);
    return response.success(res, {
      vouchers,
      message: "Available vouchers fetched successfully",
    });
  });

  getWallet = catchAsync(async (req, res) => {
    const vouchers = await this.voucherService.getWalletVouchers(
      req.user!._id.toString(),
    );
    return response.success(res, {
      vouchers,
      message: "Voucher wallet fetched successfully",
    });
  });

  getWalletAll = catchAsync(async (req, res) => {
    const vouchers = await this.voucherService.getAllWalletVouchers(
      req.user!._id.toString(),
    );
    return response.success(res, {
      vouchers,
      message: "Full voucher wallet fetched successfully",
    });
  });

  postValidate = catchAsync(async (req, res) => {
    const { code, subtotal } = req.body;
    const result = await this.voucherService.validateVoucher(
      code,
      subtotal,
      30000,
      req.user?._id?.toString(),
    );
    return response.success(res, { result, message: "Voucher is valid" });
  });

  postCollectCode = catchAsync(async (req, res) => {
    const voucher = await this.voucherService.collectVoucher(
      req.user!._id.toString(),
      req.params.code as string,
    );
    return response.created(res, {
      voucher,
      message: "Voucher saved to wallet",
    });
  });

  deleteCollectCode = catchAsync(async (req, res) => {
    await this.voucherService.uncollectVoucher(
      req.user!._id.toString(),
      req.params.code as string,
    );
    return response.success(res, { message: "Voucher removed from wallet" });
  });
}