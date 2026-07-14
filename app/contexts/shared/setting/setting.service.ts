import { injectable, inject } from "tsyringe";
import { SettingRepository } from "./setting.repository.js";

const DEFAULT_SETTINGS = {
  storeName: "GlowUp Cosmetics",
  email: "contact@glowup.vn",
  phone: "0901 234 567",
  storeAddress: "123 Nguyen Van Cu, District 5, HCMC",
  taxId: "0312345678",
  workingHours: "Monday - Sunday: 08:00 - 22:00",
  currency: "VND",
  // Rewards
  pointsEarnRate: 100, // every N VND = 1 point (default 100 VND/point)
  maxPointsPct: 50, // maximum X% of the order value can be paid with points (default 50%)
  // Profit
  profitMargin: 35, // estimated profit percentage (default 35%)
  // Branding & SEO
  logoUrl: "",
  favicon: "",
  seoTitle: "GlowUp Cosmetics - Authentic Cosmetics",
  seoDescription: "Comprehensive beauty care with authentic cosmetics at GlowUp Cosmetics.",
  // Social Links
  facebookUrl: "",
  instagramUrl: "",
  tiktokUrl: "",
  zaloUrl: "",
  // Payments
  bankName: "",
  bankAccountNumber: "",
  bankAccountName: "",
  bankQrCodeUrl: "",
};

@injectable()
export class SettingService {
  constructor(
    @inject(SettingRepository) private readonly settingRepo: SettingRepository
  ) {}

  getSettings = async () => {
    let doc = await this.settingRepo.findByKey("general_settings");
    if (!doc) {
      doc = await this.settingRepo.create({
        key: "general_settings",
        value: DEFAULT_SETTINGS,
        description: "General system configuration and payment options",
      });
    }
    return doc.value;
  };

  updateSettings = async (value: any) => {
    let doc = await this.settingRepo.findByKey("general_settings");
    if (!doc) {
      doc = await this.settingRepo.create({
        key: "general_settings",
        value: { ...DEFAULT_SETTINGS, ...value },
        description: "General system configuration and payment options",
      });
    } else {
      doc.value = { ...doc.value, ...value };
      doc.markModified("value");
      await this.settingRepo.save(doc);
    }
    return doc.value;
  };
}
