import mongoose from "mongoose";
import { z } from "zod";
import { injectable, inject } from "tsyringe";

import { catchAsync } from "../../../shared/helpers/catchAsync.js";
import * as response from "../../../shared/helpers/response.js";
import { SettingService } from "./setting.service.js";
import { AuditLogService } from "../../identity/audit-log/audit-log.service.js";
import { badRequest } from "../../../shared/errors/httpErrors.js";

const UpdateSettingsSchema = z
  .object({
    storeName: z.string().trim().max(100).optional(),
    email: z.string().trim().email("Invalid email").optional(),
    phone: z.string().trim().max(20).optional(),
    storeAddress: z.string().trim().max(300).optional(),
    taxId: z.string().trim().max(20).optional(),
    workingHours: z.string().trim().max(100).optional(),
    currency: z.enum(["VND", "USD"]).optional(),
    pointsEarnRate: z.number().int().min(1).max(100_000).optional(),
    maxPointsPct: z.number().int().min(0).max(100).optional(),
    profitMargin: z.number().min(0).max(100).optional(),
    logoUrl: z
      .string()
      .trim()
      .url("logoUrl must be a valid URL")
      .or(z.literal(""))
      .optional(),
    favicon: z
      .string()
      .trim()
      .url("favicon must be a valid URL")
      .or(z.literal(""))
      .optional(),
    seoTitle: z.string().trim().max(120).optional(),
    seoDescription: z.string().trim().max(300).optional(),
    facebookUrl: z.string().trim().url().or(z.literal("")).optional(),
    instagramUrl: z.string().trim().url().or(z.literal("")).optional(),
    youtubeUrl: z.string().trim().url().or(z.literal("")).optional(),
    tiktokUrl: z.string().trim().url().or(z.literal("")).optional(),
    zaloUrl: z.string().trim().url().or(z.literal("")).optional(),
    isCodActive: z.boolean().optional(),
    isBankActive: z.boolean().optional(),
    isQrActive: z.boolean().optional(),
    bankName: z.string().trim().max(100).optional(),
    bankAccountNumber: z.string().trim().max(30).optional(),
    bankAccountName: z.string().trim().max(100).optional(),
    bankQrCodeUrl: z.string().trim().url().or(z.literal("")).optional(),
    description: z.string().trim().max(1000).optional(),
  })
  .strict();

@injectable()
export class SettingController {
  constructor(
    @inject(SettingService) private readonly settingService: SettingService,
    @inject(AuditLogService) private readonly auditService: AuditLogService
  ) {}

  getPublic = catchAsync(async (_req, res) => {
    const all = await this.settingService.getSettings();
    // Chỉ expose các field an toàn — bao gồm chi tiết ngân hàng để checkout hiển thị
    const {
      storeName,
      phone,
      email,
      storeAddress,
      currency,
      isCodActive,
      isBankActive,
      isQrActive,
      facebookUrl,
      instagramUrl,
      youtubeUrl,
      tiktokUrl,
      zaloUrl,
      logoUrl,
      favicon,
      description,
      bankName,
      bankAccountNumber,
      bankAccountName,
      bankQrCodeUrl,
    } = all as any;
    const publicSettings = {
      storeName,
      phone,
      email,
      storeAddress,
      currency,
      isCodActive,
      isBankActive,
      isQrActive,
      facebookUrl,
      instagramUrl,
      youtubeUrl,
      tiktokUrl,
      zaloUrl,
      logoUrl,
      favicon,
      description,
      bankName,
      bankAccountNumber,
      bankAccountName,
      bankQrCodeUrl,
    };
    return response.success(res, publicSettings);
  });

  getPublicStats = catchAsync(async (_req, res) => {
    try {
      const [productsCount, customersCount, ratingResult] = await Promise.all([
        mongoose.model("Product").countDocuments({ isActive: true }),
        mongoose.model("User").countDocuments({ role: "customer" }),
        mongoose.model("Review").aggregate([
          { $group: { _id: null, avgRating: { $avg: "$rating" } } }
        ])
      ]);

      const avgRating = ratingResult[0]?.avgRating || 4.9;

      return response.success(res, {
        products: productsCount,
        customers: customersCount,
        rating: avgRating
      });
    } catch (error) {
      // Fallback in case models are not registered or something fails
      return response.success(res, {
        products: 10000,
        customers: 50000,
        rating: 4.9
      });
    }
  });

  getRoot = catchAsync(async (_req, res) => {
    const settings = await this.settingService.getSettings();
    return response.success(res, { settings });
  });

  putRoot = catchAsync(async (req, res) => {
    const parsed = UpdateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join("; ");
      throw badRequest(`Invalid configuration data: ${msg}`);
    }

    const settings = await this.settingService.updateSettings(parsed.data);
    await this.auditService.logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "settings",
      "Update store configuration",
      req.ip || "127.0.0.1",
    );
    return response.success(res, {
      message: "Configuration saved successfully",
      settings,
    });
  });
}