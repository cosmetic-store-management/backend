import Setting from "./models/setting.schema.js";

const DEFAULT_SETTINGS = {
  storeName: "GlowUp Cosmetics",
  email: "contact@glowup.com",
  phone: "0901234567",
  storeAddress: "123 Nguyễn Văn Cừ, Quận 5, TP.HCM",
  taxId: "0123456789",
  workingHours: "Thứ 2 - CN: 08:00 - 22:00",
  currency: "VND",
  // Điểm thưởng
  pointsEarnRate: 100, // mỗi N đồng = 1 điểm (mặc định 100đ/điểm)
  maxPointsPct: 50, // tối đa X% giá trị đơn có thể dùng điểm (mặc định 50%)
  // Lợi nhuận
  profitMargin: 35, // % lợi nhuận ước tính (mặc định 35%)
  // Branding & SEO
  logoUrl: "",
  favicon: "",
  seoTitle: "GlowUp Cosmetics - Mỹ phẩm chính hãng",
  seoDescription:
    "GlowUp Cosmetics chuyên cung cấp các loại mỹ phẩm chăm sóc da, trang điểm chính hãng với giá tốt nhất.",
  // Social Links
  facebookUrl: "",
  instagramUrl: "",
  tiktokUrl: "",
  zaloUrl: "",
  // Thanh toán
  bankName: "",
  bankAccountNumber: "",
  bankAccountName: "",
  bankQrCodeUrl: "",
};

export const getSettings = async () => {
  let doc = await Setting.findOne({ key: "general_settings" });
  if (!doc) {
    doc = await Setting.create({
      key: "general_settings",
      value: DEFAULT_SETTINGS,
      description: "Cấu hình chung hệ thống và tùy chọn thanh toán",
    });
  }
  return doc.value;
};

export const updateSettings = async (value: any) => {
  let doc = await Setting.findOne({ key: "general_settings" });
  if (!doc) {
    doc = await Setting.create({
      key: "general_settings",
      value: { ...DEFAULT_SETTINGS, ...value },
      description: "Cấu hình chung hệ thống và tùy chọn thanh toán",
    });
  } else {
    doc.value = { ...doc.value, ...value };
    doc.markModified("value");
    await doc.save();
  }
  return doc.value;
};
