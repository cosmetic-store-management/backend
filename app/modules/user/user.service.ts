import mongoose from "mongoose";
import Order from "../order/models/order.schema.js";
import {
  getTierBySpending,
  getNextTier,
  TIERS,
  type TierKey,
} from "./tier.constants.js";
import * as userRepo from "./user.repository.js";
import * as authRepo from "../auth/auth.repository.js";
import { mapUser } from "./dto/user.response.dto.js";
import {
  notFound,
  conflict,
  forbidden,
} from "../../shared/errors/httpErrors.js";
import { UpdateProfileInput, AddressInput } from "./dto/user.request.dto.js";
import User, { UserDocument } from "./models/user.schema.js";
import bcrypt from "bcryptjs";
import PointHistory from "./models/point-history.schema.js";
import { mapProduct } from "../product/dto/product.response.dto.js";
import { attachVariants } from "../product/product.repository.js";
// ── Source: user-tier.service.ts ──────────────────────────────
export interface TierInfoResponse {
  tier: TierKey;
  tierLabel: string; // "Diamond"
  tierLabelEn: string; // "Diamond"
  tierColor: string; // tailwind gradient
  tierBadgeClass: string;
  discount: number; // 0.10 = 10%
  discountPercent: number; // 10
  totalSpent: number; // tổng chi tiêu (VNĐ)
  orderCount: number; // số đơn đã hoàn thành
  nextTier: string | null; // label của tier tiếp theo
  nextTierLabel: string | null;
  spentToNext: number | null; // cần chi thêm bao nhiêu
  progressPercent: number; // 0-100
  tiers: TierSummary[]; // danh sách toàn bộ tiers để hiển thị bảng
}

interface TierSummary {
  key: TierKey;
  label: string;
  minSpent: number;
  discount: number;
  isCurrent: boolean;
}

/**
 * Tính thông tin hạng thành viên cho một user cụ thể.
 * Aggregate từ đơn hàng có status = "completed".
 */
export const getMyTierInfo = async (
  userId: string,
): Promise<TierInfoResponse> => {
  const [result] = await Order.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        orderStatus: "completed",
      },
    },
    {
      $group: {
        _id: null,
        totalSpent: { $sum: "$totalAmount" },
        orderCount: { $sum: 1 },
      },
    },
  ]);

  const totalSpent: number = result?.totalSpent ?? 0;
  const orderCount: number = result?.orderCount ?? 0;

  const current = getTierBySpending(totalSpent);
  const next = getNextTier(current.key);

  // Tính progress đến tier tiếp theo
  let progressPercent = 100;
  let spentToNext: number | null = null;
  if (next) {
    spentToNext = next.minSpent - totalSpent;
    progressPercent = Math.min(
      100,
      Math.round((totalSpent / next.minSpent) * 100),
    );
  }

  // Tier summary list (thấp → cao, để hiển thị bảng)
  const tiers: TierSummary[] = [...TIERS].reverse().map((t) => ({
    key: t.key,
    label: t.label,
    minSpent: t.minSpent,
    discount: t.discount,
    isCurrent: t.key === current.key,
  }));

  return {
    tier: current.key,
    tierLabel: current.label,
    tierLabelEn: current.labelEn,
    tierColor: current.color,
    tierBadgeClass: current.badgeClass,
    discount: current.discount,
    discountPercent: Math.round(current.discount * 100),
    totalSpent,
    orderCount,
    nextTier: next?.key ?? null,
    nextTierLabel: next?.label ?? null,
    spentToNext,
    progressPercent,
    tiers,
  };
};

// ── Source: user-profile.service.ts ──────────────────────────────
export const updateCurrentUser = async (
  userId: string,
  data: UpdateProfileInput,
) => {
  const user = await userRepo.findById(userId);
  if (!user) throw notFound("User not found");

  if (data.name !== undefined) user.name = data.name;
  if (data.phone !== undefined && data.phone !== user.phone) {
    // Bug #2 Fix: kiểm tra phone unique trước khi update
    const phoneOwner = await userRepo.findByPhone(data.phone);
    if (phoneOwner && phoneOwner._id.toString() !== userId) {
      throw conflict("This phone number is already used by another account");
    }
    user.phone = data.phone;
  }
  if (data.email !== undefined && data.email !== user.email) {
    if (data.email) {
      const emailOwner = await userRepo.findByEmail(data.email);
      if (emailOwner && emailOwner._id.toString() !== userId) {
        throw conflict("This email is already used by another account");
      }

      // Check if OTP was verified
      const otpRecord = await authRepo.findOtpByEmail(data.email);
      if (!otpRecord || !otpRecord.isVerified) {
        throw forbidden("You must verify your Email with an OTP before updating");
      }
      await authRepo.deleteOtp(data.email);
    }
    user.email = data.email;
  }
  if (data.dob !== undefined) user.dob = new Date(data.dob);
  if (data.gender !== undefined) user.gender = data.gender;

  await userRepo.save(user);
  return mapUser(user);
};

export const updateAvatar = async (userId: string, avatarDataUrl: string) => {
  const user = await userRepo.findById(userId);
  if (!user) throw notFound("User not found");

  // Validate: chỉ chấp nhận JPEG/PNG data URL, tối đa 1MB
  if (!avatarDataUrl.startsWith("data:image/")) {
    throw { status: 400, message: "Invalid image format" };
  }
  const base64Data = avatarDataUrl.split(",")[1] || "";
  const sizeBytes = (base64Data.length * 3) / 4;
  if (sizeBytes > 1.5 * 1024 * 1024) {
    throw { status: 400, message: "Ảnh vượt quá dung lượng cho phép (1.5 MB)" };
  }

  user.avatar = avatarDataUrl;
  await userRepo.save(user);
  return mapUser(user);
};

// ── Address Book ─────────────────────────────────────────────────────────────

export const addAddress = async (userId: string, data: AddressInput) => {
  const user = await userRepo.findById(userId);
  if (!user) throw notFound("User not found");

  if (!user.addresses) {
    user.addresses = [];
  }

  if (data.isDefault) {
    user.addresses.forEach((a) => (a.isDefault = false));
  } else if (user.addresses.length === 0) {
    data.isDefault = true;
  }

  // Mongoose subdoc arrays accept partial push — TS strict mode false positive
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (user.addresses as any[]).push(data);
  await userRepo.save(user);
  return mapUser(user);
};

export const updateAddress = async (
  userId: string,
  addressId: string,
  data: AddressInput,
) => {
  const user = await userRepo.findById(userId);
  if (!user) throw notFound("User not found");

  if (!user.addresses) {
    user.addresses = [];
  }

  const address = user.addresses.find((a) => a._id?.toString() === addressId);
  if (!address) throw notFound("Address not found");

  if (data.isDefault) {
    user.addresses.forEach((a) => (a.isDefault = false));
  }

  address.province = data.province;
  address.district = data.district;
  address.ward = data.ward;
  address.street = data.street;
  if (data.isDefault !== undefined) address.isDefault = data.isDefault;

  await userRepo.save(user);
  return mapUser(user);
};

export const deleteAddress = async (userId: string, addressId: string) => {
  const user = await userRepo.findById(userId);
  if (!user) throw notFound("User not found");

  const addrIndex = user.addresses.findIndex(
    (a) => a._id?.toString() === addressId,
  );
  if (addrIndex === -1) throw notFound("Address not found");

  const isDefault = user.addresses[addrIndex].isDefault;
  user.addresses.splice(addrIndex, 1);

  // Nếu xóa địa chỉ mặc định, tự động gán cái đầu tiên làm mặc định
  if (isDefault && user.addresses.length > 0) {
    user.addresses[0].isDefault = true;
  }

  await userRepo.save(user);
  return mapUser(user);
};

// ── Source: user-staff.service.ts ──────────────────────────────
const checkHierarchy = (requester: UserDocument, target: UserDocument) => {
  if (requester.role === "manager") {
    if (target.role === "owner" || target.role === "manager") {
      throw forbidden(
        "You do not have permission to modify higher or equal level accounts",
      );
    }
  }
};

export const getStaffUsers = async (
  page: number = 1,
  limit: number = 20,
  search?: string,
  status?: string,
  role?: string,
) => {
  const result = await userRepo.findStaffs(page, limit, search, status, role);
  return {
    ...result,
    users: result.users.map(mapUser),
  };
};

export const getUserById = async (id: string) => {
  const user = await userRepo.findById(id);
  if (!user) throw notFound("User not found");
  return mapUser(user);
};

export const updateUserByAdmin = async (
  id: string,
  data: any,
  requester: UserDocument,
) => {
  const user = await userRepo.findById(id);
  if (!user) throw notFound("User not found");

  checkHierarchy(requester, user);

  if (data.name !== undefined) user.name = data.name;
  if (data.phone !== undefined) user.phone = data.phone;
  if (data.email !== undefined) user.email = data.email;

  if (
    data.province !== undefined ||
    data.district !== undefined ||
    data.ward !== undefined ||
    data.street !== undefined
  ) {
    let defaultAddr = user.addresses.find((a: any) => a.isDefault);
    if (!defaultAddr && user.addresses.length > 0) {
      defaultAddr = user.addresses[0];
    }
    if (!defaultAddr) {
      user.addresses.push({
        isDefault: true,
        name: data.name || user.name,
        phone: data.phone || user.phone,
        province: data.province || "",
        district: data.district || "",
        ward: data.ward || "",
        street: data.street || "",
      } as any);
    } else {
      if (data.province !== undefined) defaultAddr.province = data.province;
      if (data.district !== undefined) defaultAddr.district = data.district;
      if (data.ward !== undefined) defaultAddr.ward = data.ward;
      if (data.street !== undefined) defaultAddr.street = data.street;
    }
  }

  await userRepo.save(user);
  return mapUser(user);
};

export const updateInternalNotes = async (
  id: string,
  internalNotes: string,
) => {
  const user = await userRepo.findById(id);
  if (!user) throw notFound("User not found");

  user.internalNotes = internalNotes;
  await userRepo.save(user);
  return mapUser(user);
};

export const updateStaffInternalNotes = async (
  id: string,
  internalNotes: string,
  requester: UserDocument,
) => {
  const user = await userRepo.findById(id);
  if (!user) throw notFound("User not found");

  checkHierarchy(requester, user);

  user.internalNotes = internalNotes;
  await userRepo.save(user);
  return mapUser(user);
};

export const updateUserRole = async (
  id: string,
  role: "manager" | "staff",
  permissions: string[] | undefined,
  requester: UserDocument,
) => {
  const user = await userRepo.findById(id);
  if (!user) throw notFound("User not found");
  if (user.role === "owner")
    throw conflict("Cannot change the permissions of the Owner");

  checkHierarchy(requester, user);

  let newRole = role;
  if (requester.role === "manager" && role === "manager") {
    newRole = "staff"; // Ép về staff nếu manager cố tình thăng cấp
  }

  if (newRole) user.role = newRole;
  if (permissions) user.permissions = permissions as any[];

  await userRepo.save(user);
  return mapUser(user);
};

export const updateUserStatus = async (
  id: string,
  isActive: boolean,
  requester: UserDocument,
) => {
  const user = await userRepo.findById(id);
  if (!user) throw notFound("User not found");
  if (user.role === "owner")
    throw conflict("Cannot lock the Owner account");

  checkHierarchy(requester, user);

  user.isActive = isActive;
  await userRepo.save(user);
  return mapUser(user);
};

export const resetUserPassword = async (
  id: string,
  requester: UserDocument,
) => {
  const user = await userRepo.findById(id);
  if (!user) throw notFound("User not found");
  if (user.role === "owner")
    throw conflict("Cannot operate on the Owner account");

  checkHierarchy(requester, user);

  // Đọc từ env để không hardcode mật khẩu trong source code
  const defaultPassword = process.env.DEFAULT_STAFF_PASSWORD || "GlowUp@123456";
  user.password = await bcrypt.hash(defaultPassword, 12);
  await userRepo.save(user);
  return mapUser(user);
};

export const deleteUserById = async (id: string, requester: UserDocument) => {
  const user = await userRepo.findById(id);
  if (!user) throw notFound("User not found");
  if (user.role === "owner")
    throw conflict("Cannot delete the Owner account");

  checkHierarchy(requester, user);

  // Kiểm tra đơn hàng đang xử lý nếu là khách hàng
  if (user.role === "customer") {
    const activeOrder = await Order.findOne({
      userId: id,
      orderStatus: { $in: ["pending", "processing", "shipping", "return_pending"] },
    });
    
    if (activeOrder) {
      throw conflict("Cannot delete. This customer has uncompleted or pending return orders.");
    }
  }

  // Thực thi Ẩn danh hóa (Data Anonymization)
  user.isDeleted = true;
  user.deletedAt = new Date();
  user.deletedBy = requester._id as any;
  
  user.name = "Người dùng ẩn danh";
  user.email = undefined; 
  user.phone = undefined; 
  user.password = undefined;
  user.dob = undefined;
  user.gender = undefined;
  user.avatar = undefined;
  user.addresses = []; 
  user.refreshTokens = []; 
  user.internalNotes = `Đã bị xóa bởi hệ thống lúc ${new Date().toISOString()}`;
  user.isActive = false;

  await userRepo.save(user);
};

export const createStaff = async (data: any, requester: UserDocument) => {
  const existingPhone = await userRepo.findByPhone(data.phone);
  if (existingPhone) throw conflict("Phone number already exists");
  if (data.email) {
    const existingEmail = await userRepo.findByEmail(data.email);
    if (existingEmail) throw conflict("Email already exists");
  }

  let finalRole = data.role || "staff";
  if (requester.role === "manager") {
    finalRole = "staff"; // Manager chỉ được tạo Staff
  }

  const hashedPassword = await bcrypt.hash(data.password || "123456", 12);
  const newUser = await userRepo.create({
    name: data.name,
    email: data.email || undefined,
    phone: data.phone,
    password: hashedPassword,
    role: finalRole,
    permissions: data.permissions || [],
  });
  return mapUser(newUser);
};

// ── Source: user-customer.service.ts ──────────────────────────────
export const getCustomers = async (
  page: number = 1,
  limit: number = 20,
  search?: string,
  tier?: string,
  status?: string,
  spending?: string,
  lastPurchase?: string,
  sortBy?: string,
  source?: string,
  startDate?: string,
  endDate?: string,
) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const oneEightyDaysAgo = new Date();
  oneEightyDaysAgo.setDate(oneEightyDaysAgo.getDate() - 180);

  const threeSixtyFiveDaysAgo = new Date();
  threeSixtyFiveDaysAgo.setDate(threeSixtyFiveDaysAgo.getDate() - 365);

  // 1. Calculate Overview Metrics (Global for all customers)
  const [overviewResult] = await User.aggregate([
    { $match: { role: "customer" } },
    {
      $lookup: {
        from: "orders",
        localField: "_id",
        foreignField: "userId",
        as: "orders",
      },
    },
    {
      $project: {
        createdAt: 1,
        completedOrders: {
          $filter: {
            input: "$orders",
            as: "order",
            cond: { $eq: ["$$order.orderStatus", "completed"] },
          },
        },
      },
    },
    {
      $addFields: {
        orderCount: { $size: "$completedOrders" },
        lastPurchaseDate: { $max: "$completedOrders.createdAt" },
      },
    },
    {
      $group: {
        _id: null,
        totalCustomers: { $sum: 1 },
        newCustomers: {
          $sum: { $cond: [{ $gte: ["$createdAt", thirtyDaysAgo] }, 1, 0] },
        },
        returningCustomers: {
          $sum: { $cond: [{ $gte: ["$orderCount", 2] }, 1, 0] },
        },
        churningCustomers: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gte: ["$orderCount", 1] },
                  { $lt: ["$lastPurchaseDate", ninetyDaysAgo] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  const overview = overviewResult || {
    totalCustomers: 0,
    newCustomers: 0,
    returningCustomers: 0,
    churningCustomers: 0,
  };

  // 2. Build Filtered Table Pipeline
  const match: any = { role: "customer" };
  if (search) {
    match.$or = [
      { name: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  if (status && status !== "all") {
    match.isActive = status === "active";
  }

  if (source && source !== "all") {
    if (source === "web") {
      match.password = { $exists: true, $ne: null };
    } else {
      match.password = { $exists: false };
    }
  }

  // Tier filter dùng totalSpent (spending-based — nhất quán với tier.constants.ts)
  // Note: tier filter sẽ áp dụng ở post-match sau khi tính totalSpent từ aggregate

  const pipeline: any[] = [
    { $match: match },
    {
      $lookup: {
        from: "orders",
        localField: "_id",
        foreignField: "userId",
        as: "orders",
      },
    },
    {
      $project: {
        name: 1,
        email: 1,
        phone: 1,
        points: 1,
        isActive: 1,
        createdAt: 1,
        password: 1,
        providers: 1,
        province: 1,
        district: 1,
        ward: 1,
        street: 1,
        completedOrders: {
          $filter: {
            input: "$orders",
            as: "order",
            cond: { $eq: ["$$order.orderStatus", "completed"] },
          },
        },
      },
    },
    {
      $addFields: {
        orderCount: { $size: "$completedOrders" },
        totalSpent: { $sum: "$completedOrders.totalAmount" },
        lastPurchaseDate: { $max: "$completedOrders.createdAt" },
        hasOnlineAccount: {
          $cond: [
            {
              $or: [
                { $ifNull: ["$password", false] },
                { $gt: [{ $size: { $ifNull: ["$providers", []] } }, 0] },
              ],
            },
            true,
            false,
          ],
        },
      },
    },
  ];

  // Post-match for spending, tier, and lastPurchase
  const postMatch: any = {};

  if (spending && spending !== "all") {
    if (spending === "0") {
      postMatch.totalSpent = 0;
    } else if (spending === "under_1m") {
      postMatch.totalSpent = { $gt: 0, $lt: 1000000 };
    } else if (spending === "1m_to_5m") {
      postMatch.totalSpent = { $gte: 1000000, $lte: 5000000 };
    } else if (spending === "over_5m") {
      postMatch.totalSpent = { $gt: 5000000 };
    }
  }

  // Tier filter dùng TIERS constants (single source of truth từ tier.constants.ts)
  if (tier && tier !== "all") {
    const tierDef = TIERS.find((t) => t.key === tier);
    if (tierDef) {
      const nextTierDef = TIERS[TIERS.indexOf(tierDef) - 1]; // tier cao hơn tiếp theo
      if (nextTierDef) {
        postMatch.totalSpent = {
          $gte: tierDef.minSpent,
          $lt: nextTierDef.minSpent,
        };
      } else {
        // Diamond (tier cao nhất) — không có giới hạn trên
        postMatch.totalSpent = { $gte: tierDef.minSpent };
      }
    }
  }

  if (lastPurchase && lastPurchase !== "all") {
    if (lastPurchase === "30_days") {
      postMatch.lastPurchaseDate = { $gte: thirtyDaysAgo };
    } else if (lastPurchase === "90_days") {
      postMatch.lastPurchaseDate = { $lt: thirtyDaysAgo, $gte: ninetyDaysAgo };
    } else if (lastPurchase === "180_days") {
      postMatch.lastPurchaseDate = {
        $lt: ninetyDaysAgo,
        $gte: oneEightyDaysAgo,
      };
    } else if (lastPurchase === "365_days") {
      postMatch.lastPurchaseDate = {
        $lt: oneEightyDaysAgo,
        $gte: threeSixtyFiveDaysAgo,
      };
    } else if (lastPurchase === "over_365_days") {
      postMatch.lastPurchaseDate = { $lt: threeSixtyFiveDaysAgo };
    } else if (lastPurchase === "custom") {
      const customMatch: any = {};
      if (startDate) {
        customMatch.$gte = new Date(startDate);
      }
      if (endDate) {
        // Adjust end date to the end of the day
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        customMatch.$lte = end;
      }
      if (Object.keys(customMatch).length > 0) {
        postMatch.lastPurchaseDate = customMatch;
      }
    }
  }

  if (Object.keys(postMatch).length > 0) {
    pipeline.push({ $match: postMatch });
  }

  // Sorting
  let sortStage: any = { createdAt: -1 };
  if (sortBy) {
    if (sortBy === "spent_high" || sortBy === "spent_desc")
      sortStage = { totalSpent: -1, createdAt: -1 };
    else if (sortBy === "spent_low")
      sortStage = { totalSpent: 1, createdAt: -1 };
    else if (sortBy === "points_high" || sortBy === "points_desc")
      sortStage = { points: -1, createdAt: -1 };
    else if (sortBy === "points_low") sortStage = { points: 1, createdAt: -1 };
    else if (sortBy === "new_customer") sortStage = { createdAt: -1 };
    else if (sortBy === "old_customer") sortStage = { createdAt: 1 };
  }
  pipeline.push({ $sort: sortStage });

  const skip = (page - 1) * limit;

  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        { $limit: limit },
        { $project: { completedOrders: 0, password: 0 } },
      ],
      totalCount: [{ $count: "count" }],
    },
  });

  const [result] = await User.aggregate(pipeline);

  const customers = result.data.map((u: any) => {
    const defaultAddress = (u.addresses || []).find((a: any) => a.isDefault) || (u.addresses || [])[0] || {};
    return {
      id: u._id.toString(),
      name: u.name,
      email: u.email,
      phone: u.phone,
      points: u.points || 0,
      isActive: u.isActive,
      hasOnlineAccount: u.hasOnlineAccount,
      orderCount: u.orderCount,
      totalSpent: u.totalSpent,
      createdAt: u.createdAt,
      lastPurchaseDate: u.lastPurchaseDate || null,
      province: defaultAddress.province || "",
      district: defaultAddress.district || "",
      ward: defaultAddress.ward || "",
      street: defaultAddress.street || "",
    };
  });

  const totalElements = result.totalCount[0]?.count || 0;
  if (customers.length > 0) {
    console.log("DEBUG getCustomers first user province:", customers[0].name, customers[0].province);
  }

  return {
    overview: {
      totalCustomers: overview.totalCustomers || 0,
      newCustomers: overview.newCustomers || 0,
      returningCustomers: overview.returningCustomers || 0,
      churningCustomers: overview.churningCustomers || 0,
    },
    content: customers,
    totalPages: Math.ceil(totalElements / limit),
    totalElements,
    page,
    limit,
  };
};

export const createManualCustomer = async (data: any) => {
  const existing = await userRepo.findByPhone(data.phone);
  if (existing) throw conflict("Phone number already exists");

  const hashedPassword = data.password
    ? await bcrypt.hash(data.password, 12)
    : undefined;

  const newUser = await userRepo.create({
    name: data.name,
    email: data.email || undefined,
    phone: data.phone,
    password: hashedPassword,
    role: "customer",
    permissions: [], // exception case: customers never have permissions
  });
  return mapUser(newUser);
};

export const adjustUserPoints = async (
  id: string,
  pointsChanged: number,
  reason: string,
  performedBy: string,
) => {
  const user = await userRepo.findById(id);
  if (!user) throw notFound("User not found");

  const newPoints = user.points + pointsChanged;
  if (newPoints < 0) throw conflict("Điểm không thể là số âm");

  user.points = newPoints;
  await userRepo.save(user);

  await PointHistory.create({
    userId: user._id,
    pointsChanged,
    reason,
    performedBy,
  });

  return mapUser(user);
};

// ── Source: user-interactions.service.ts ──────────────────────────────
export const getFavorites = async (userId: string) => {
  const user = await userRepo.findById(userId);
  if (!user) throw notFound("User not found");
  await user.populate({
    path: "favorites",
    populate: [
      { path: "brandId", select: "name" },
      { path: "categoryId", select: "name" }
    ]
  });
  const products = (user.favorites || []) as any[];
  const productsWithVariants = await attachVariants(products);
  return productsWithVariants.map((p) => mapProduct(p));
};

// POST toggle favorite
export const toggleFavorite = async (userId: string, productId: string) => {
  const user = await userRepo.findById(userId);
  if (!user) throw notFound("User not found");

  const productObjectId = new mongoose.Types.ObjectId(productId);
  const favorites = user.favorites || [];

  const index = favorites.findIndex((id) => id.toString() === productId);
  if (index !== -1) {
    favorites.splice(index, 1);
  } else {
    favorites.push(productObjectId);
  }

  user.favorites = favorites;
  await userRepo.save(user);
  return { action: index !== -1 ? "removed" : "added" };
};

// GET recently viewed (with pagination)
export const getRecentlyViewed = async (
  userId: string,
  page = 1,
  limit = 12,
) => {
  const user = await userRepo.findById(userId);
  if (!user) throw notFound("User not found");
  await user.populate({
    path: "recentlyViewed",
    populate: [
      { path: "brandId", select: "name" },
      { path: "categoryId", select: "name" }
    ]
  });
  const all = (user.recentlyViewed || []) as any[];
  const total = all.length;
  const totalPages = Math.ceil(total / limit);
  const sliced = all.slice((page - 1) * limit, page * limit);
  const withVariants = await attachVariants(sliced);
  return {
    products: withVariants.map((p) => mapProduct(p)),
    total,
    page,
    limit,
    totalPages,
  };
};

// POST record recently viewed
export const recordRecentlyViewed = async (
  userId: string,
  productId: string,
) => {
  const user = await userRepo.findById(userId);
  if (!user) throw notFound("User not found");

  const productObjectId = new mongoose.Types.ObjectId(productId);
  const viewed = user.recentlyViewed || [];

  const index = viewed.findIndex((id) => id.toString() === productId);
  if (index !== -1) {
    viewed.splice(index, 1);
  }

  viewed.unshift(productObjectId);

  if (viewed.length > 20) {
    viewed.pop();
  }

  user.recentlyViewed = viewed;
  await userRepo.save(user);
  return { success: true };
};

// DELETE remove one from viewed
export const removeFromViewed = async (userId: string, productId: string) => {
  const user = await userRepo.findById(userId);
  if (!user) throw notFound("User not found");

  const viewed = user.recentlyViewed || [];
  const index = viewed.findIndex((id) => id.toString() === productId);
  if (index !== -1) {
    viewed.splice(index, 1);
    user.recentlyViewed = viewed;
    await userRepo.save(user);
  }
  return { success: true };
};

// DELETE clear all viewed
export const clearRecentlyViewed = async (userId: string) => {
  const user = await userRepo.findById(userId);
  if (!user) throw notFound("User not found");
  user.recentlyViewed = [];
  await userRepo.save(user);
  return { success: true };
};

// DELETE user (Admin only)
export const deleteUser = async (targetUserId: string, currentUser: UserDocument) => {
  if (targetUserId === currentUser._id.toString()) {
    throw forbidden("Bạn không thể xóa chính mình");
  }

  const targetUser = await userRepo.findById(targetUserId);
  if (!targetUser) throw notFound("User not found");

  if (targetUser.role === "owner") {
    throw forbidden("Không thể xóa tài khoản chủ cửa hàng (owner)");
  }

  await User.findByIdAndDelete(targetUserId);
  
  return { success: true };
};
