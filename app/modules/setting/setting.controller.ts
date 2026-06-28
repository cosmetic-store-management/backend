import { Router } from "express";
import { z } from "zod";
import { authenticate, isOwner } from "../../middlewares/auth.middleware.js";
import { catchAsync } from "../../shared/helpers/catchAsync.js";
import * as response from "../../shared/helpers/response.js";
import * as settingService from "./setting.service.js";
import { logAction } from "../audit-log/audit-log.service.js";
import { badRequest } from "../../shared/errors/httpErrors.js";

const router = Router();

// ── Zod schema cho PUT /api/settings ─────────────────────────────────────────

const UpdateSettingsSchema = z
  .object({
    storeName: z.string().trim().max(100).optional(),
    email: z.string().trim().email("Email không hợp lệ").optional(),
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
      .url("logoUrl phải là URL hợp lệ")
      .or(z.literal(""))
      .optional(),
    favicon: z
      .string()
      .trim()
      .url("favicon phải là URL hợp lệ")
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

// ── GET /api/settings/public — không cần auth ─────────────────────────────────

router.get(
  "/public",
  catchAsync(async (_req, res) => {
    const all = await settingService.getSettings();
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
  }),
);

// ── GET /api/settings — authenticated ─────────────────────────────────────────

router.get(
  "/",
  authenticate,
  catchAsync(async (_req, res) => {
    const settings = await settingService.getSettings();
    return response.success(res, { settings });
  }),
);

// ── PUT /api/settings — owner only, Zod validated ─────────────────────────────

router.put(
  "/",
  authenticate,
  isOwner,
  catchAsync(async (req, res) => {
    const parsed = UpdateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join("; ");
      throw badRequest(`Dữ liệu cấu hình không hợp lệ: ${msg}`);
    }

    const settings = await settingService.updateSettings(parsed.data);
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "settings",
      "Cập nhật cấu hình cửa hàng",
      req.ip || "127.0.0.1",
    );
    return response.success(res, {
      message: "Cấu hình được lưu thành công",
      settings,
    });
  }),
);

export default router;
