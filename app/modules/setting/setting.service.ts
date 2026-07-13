import { injectable } from "tsyringe";
import Setting from "./models/setting.schema.js";

const DEFAULT_SETTINGS = {
  storeName: "GlowUp Cosmetics",
  email: "contact@glowup.com",
  phone: "0901234567",
  storeAddress: "123 Nguyen Van Cu, District 5, Ho Chi Minh City",
  taxId: "0123456789",
  workingHours: "Mon - Sun: 08:00 - 22:00",
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
  seoDescription:
    "GlowUp Cosmetics specializes in authentic skincare and makeup products at the best prices.",
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
  getSettings = async () => {
    let doc = await Setting.findOne({ key: "general_settings" });
    if (!doc) {
      doc = await Setting.create({
        key: "general_settings",
        value: DEFAULT_SETTINGS,
        description: "General system configuration and payment options",
      });
    }
    return doc.value;
  };

  updateSettings = async (value: any) => {
    let doc = await Setting.findOne({ key: "general_settings" });
    if (!doc) {
      doc = await Setting.create({
        key: "general_settings",
        value: { ...DEFAULT_SETTINGS, ...value },
        description: "General system configuration and payment options",
      });
    } else {
      doc.value = { ...doc.value, ...value };
      doc.markModified("value");
      await doc.save();
    }
    return doc.value;
  };
}
