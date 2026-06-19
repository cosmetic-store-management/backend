import Setting from "../../models/setting.schema.js";
import Product from "../../models/product.schema.js";
import Category from "../../models/category.schema.js";
import Order from "../../models/order.schema.js";
import User from "../../models/user.schema.js";
import Brand from "../../models/brand.schema.js";
import Supplier from "../../models/supplier.schema.js";
import GoodsReceipt from "../../models/goods-receipt.schema.js";
import InventoryTransaction from "../../models/inventory-transaction.schema.js";
import AuditLog from "../../models/audit-log.schema.js";

const DEFAULT_SETTINGS = {
  storeName:             "GlowUp Cosmetics",
  email:                 "contact@glowup.com",
  phone:                 "0901234567",
  storeAddress:          "123 Nguyễn Văn Cừ, Quận 5, TP.HCM",
  currency:              "VND",
  standardShippingFee:   30000,
  freeShippingThreshold: 500000,
  // Điểm thưởng
  pointsEarnRate:        100,     // mỗi N đồng = 1 điểm (mặc định 100đ/điểm)
  maxPointsPct:          50,      // tối đa X% giá trị đơn có thể dùng điểm (mặc định 50%)
  // Thanh toán
  isCodActive:           true,
  isBankActive:          false,
  bankName:              "",
  bankAccountNumber:     "",
  bankAccountName:       "",
  isQrActive:            false,
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

export const exportDatabaseBackup = async () => {
  const [
    products,
    categories,
    orders,
    users,
    brands,
    suppliers,
    goodsReceipts,
    transactions,
    auditLogs,
    settings,
  ] = await Promise.all([
    Product.find().lean(),
    Category.find().lean(),
    Order.find().lean(),
    User.find().select("-password").lean(),
    Brand.find().lean(),
    Supplier.find().lean(),
    GoodsReceipt.find().lean(),
    InventoryTransaction.find().lean(),
    AuditLog.find().lean(),
    Setting.find().lean(),
  ]);

  return {
    backupTimestamp: new Date(),
    products,
    categories,
    orders,
    users,
    brands,
    suppliers,
    goodsReceipts,
    transactions,
    auditLogs,
    settings,
  };
};
