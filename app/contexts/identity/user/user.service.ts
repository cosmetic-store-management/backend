// ReviewService removed — UserService now communicates via eventBus (user.deleted event)
import mongoose from "mongoose";
import Order from "../../sales/order/models/order.schema.js";
import { getTierBySpending, getNextTier, TIERS, type TierKey } from "./tier.constants.js";
import { UserRepository } from "./user.repository.js";
import { AuthRepository } from "../auth/auth.repository.js";
import { mapUser } from "./dto/user.response.dto.js";
import { notFound, conflict, forbidden } from "../../../shared/errors/httpErrors.js";
import { UpdateProfileInput, AddressInput } from "./dto/user.request.dto.js";
import User, { UserDocument } from "./models/user.schema.js";
import bcrypt from "bcryptjs";
import PointHistory from "./models/point-history.schema.js";
import { mapProduct } from "../../catalog/product/dto/product.response.dto.js";
import { ProductRepository } from "../../catalog/product/product.repository.js";
import { injectable, inject } from "tsyringe";
import { eventBus } from "../../shared/event-bus/index.js";

export interface TierInfoResponse {
  tier: TierKey;
  tierLabel: string;
  tierLabelEn: string;
  tierColor: string;
  tierBadgeClass: string;
  discount: number;
  discountPercent: number;
  totalSpent: number;
  orderCount: number;
  nextTier: string | null;
  nextTierLabel: string | null;
  spentToNext: number | null;
  progressPercent: number;
  tiers: TierSummary[];
}

export interface TierSummary {
  key: TierKey;
  label: string;
  minSpent: number;
  discount: number;
  isCurrent: boolean;
}

@injectable()
export class UserService {
  constructor(
    @inject(ProductRepository) private readonly productRepo: ProductRepository,
    @inject(UserRepository) private readonly userRepo: UserRepository,
    @inject(AuthRepository) private readonly authRepo: AuthRepository
  ) {
    eventBus.on("user.points.added", async (payload: any) => {
      try {
        const { userId, points, orderId, session } = payload;
        await User.findOneAndUpdate(
          { _id: userId },
          { $inc: { points: points } },
          { session }
        );
        await PointHistory.create([{
          userId,
          pointsChanged: points,
          reason: orderId ? `Tích điểm từ đơn hàng ${orderId}` : "Tích điểm",
          performedBy: userId,
        }], { session });
      } catch (err) {
        console.error("Error handling user.points.added:", err);
      }
    });

    eventBus.on("user.points.deducted", async (payload: any) => {
      try {
        const { userId, points, orderId, session } = payload;
        const updatedUser = await User.findOneAndUpdate(
          { _id: userId, points: { $gte: points } },
          { $inc: { points: -points } },
          { session, returnDocument: "after" }
        );
        if (!updatedUser) {
           throw new Error("Điểm tích lũy không đủ hoặc đã thay đổi do giao dịch khác. Vui lòng thử lại.");
        }
        await PointHistory.create([{
          userId,
          pointsChanged: -points,
          reason: orderId ? `Sử dụng điểm cho đơn hàng ${orderId}` : "Thanh toán bằng điểm",
          performedBy: userId,
        }], { session });
      } catch (err) {
        console.error("Error handling user.points.deducted:", err);
        throw err;
      }
    });
  }

  async getMyTierInfo(userId: string): Promise<TierInfoResponse> {
    const [result] = await Order.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), orderStatus: "completed" } },
      { $group: { _id: null, totalSpent: { $sum: "$totalAmount" }, orderCount: { $sum: 1 } } }
    ]);
    const totalSpent: number = result?.totalSpent ?? 0;
    const orderCount: number = result?.orderCount ?? 0;
    const current = getTierBySpending(totalSpent);
    const next = getNextTier(current.key);
    let progressPercent = 100;
    let spentToNext: number | null = null;
    if (next) {
      spentToNext = next.minSpent - totalSpent;
      progressPercent = Math.min(100, Math.round((totalSpent / next.minSpent) * 100));
    }
    const tiers: TierSummary[] = [...TIERS].reverse().map((t) => ({
      key: t.key, label: t.label, minSpent: t.minSpent, discount: t.discount, isCurrent: t.key === current.key,
    }));
    return {
      tier: current.key, tierLabel: current.label, tierLabelEn: current.labelEn, tierColor: current.color, tierBadgeClass: current.badgeClass, discount: current.discount, discountPercent: Math.round(current.discount * 100), totalSpent, orderCount, nextTier: next?.key ?? null, nextTierLabel: next?.label ?? null, spentToNext, progressPercent, tiers,
    };
  }

  async updateCurrentUser(userId: string, data: UpdateProfileInput) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const user = await this.userRepo.findById(userId).session(session);
      if (!user) throw notFound("User not found");
      if (data.name !== undefined) user.name = data.name;
      if (data.phone !== undefined && data.phone !== user.phone) {
        const phoneOwner = await User.findOne({ phone: data.phone, isDeleted: { $ne: true } }).session(session);
        if (phoneOwner && phoneOwner._id.toString() !== userId) throw conflict("This phone number is already used by another account");
        user.phone = data.phone;
      }
      if (data.email !== undefined && data.email !== user.email) {
        if (data.email) {
          const emailOwner = await User.findOne({ email: data.email, isDeleted: { $ne: true } }).session(session);
          if (emailOwner && emailOwner._id.toString() !== userId) throw conflict("This email is already used by another account");
          const otpRecord = await this.authRepo.findOtpByEmail(data.email);
          if (!otpRecord || !otpRecord.isVerified) throw forbidden("You must verify your email with an OTP before updating");
          await this.authRepo.deleteOtp(data.email);
        }
        user.email = data.email;
      }
      if (data.dob !== undefined) user.dob = new Date(data.dob);
      if (data.gender !== undefined) user.gender = data.gender;
      await user.save({ session });
      await session.commitTransaction();
      return mapUser(user);
    } catch (error: any) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async updateAvatar(userId: string, avatarDataUrl: string) {
    const user = await this.userRepo.findById(userId);
    if (!user) throw notFound("User not found");
    if (!avatarDataUrl.startsWith("data:image/")) throw { status: 400, message: "Invalid image format" };
    const base64Data = avatarDataUrl.split(",")[1] || "";
    const sizeBytes = (base64Data.length * 3) / 4;
    if (sizeBytes > 1.5 * 1024 * 1024) throw { status: 400, message: "Image exceeds the allowed size (1.5 MB)" };
    user.avatar = avatarDataUrl;
    await this.userRepo.save(user);
    return mapUser(user);
  }

  async addAddress(userId: string, data: AddressInput) {
    const user = await this.userRepo.findById(userId);
    if (!user) throw notFound("User not found");
    if (!user.addresses) user.addresses = [];
    if (data.isDefault) user.addresses.forEach((a) => (a.isDefault = false));
    else if (user.addresses.length === 0) data.isDefault = true;
    (user.addresses as any[]).push(data);
    await this.userRepo.save(user);
    return mapUser(user);
  }

  async updateAddress(userId: string, addressId: string, data: AddressInput) {
    const user = await this.userRepo.findById(userId);
    if (!user) throw notFound("User not found");
    if (!user.addresses) user.addresses = [];
    const address = user.addresses.find((a) => a._id?.toString() === addressId);
    if (!address) throw notFound("Address not found");
    if (data.isDefault) user.addresses.forEach((a) => (a.isDefault = false));
    address.province = data.province;
    address.district = data.district;
    address.ward = data.ward;
    address.street = data.street;
    if (data.isDefault !== undefined) address.isDefault = data.isDefault;
    await this.userRepo.save(user);
    return mapUser(user);
  }

  async deleteAddress(userId: string, addressId: string) {
    const user = await this.userRepo.findById(userId);
    if (!user) throw notFound("User not found");
    const addrIndex = user.addresses.findIndex((a) => a._id?.toString() === addressId);
    if (addrIndex === -1) throw notFound("Address not found");
    const isDefault = user.addresses[addrIndex].isDefault;
    user.addresses.splice(addrIndex, 1);
    if (isDefault && user.addresses.length > 0) user.addresses[0].isDefault = true;
    await this.userRepo.save(user);
    return mapUser(user);
  }

  private checkHierarchy(requester: UserDocument, target: UserDocument) {
    if (requester.role === "manager") {
      if (target.role === "owner" || target.role === "manager") {
        throw forbidden("You do not have permission to modify higher or equal level accounts");
      }
    }
  }

  async getStaffUsers(page = 1, limit = 20, search?: string, status?: string, role?: string, hiringStatus?: string, workingShift?: string) {
    const result = await this.userRepo.findStaffs(page, limit, search, status, role, hiringStatus, workingShift);
    return { ...result, users: result.users.map(mapUser) };
  }

  async getUserById(id: string) {
    const user = await this.userRepo.findById(id);
    if (!user) throw notFound("User not found");
    return mapUser(user);
  }

  async updateUserByAdmin(id: string, data: any, requester: UserDocument) {
    const user = await this.userRepo.findById(id);
    if (!user) throw notFound("User not found");
    this.checkHierarchy(requester, user);
    if (data.name !== undefined) user.name = data.name;
    if (data.phone !== undefined) user.phone = data.phone;
    if (data.email !== undefined) user.email = data.email;
    if (data.citizenId !== undefined) user.citizenId = data.citizenId;
    if (data.startDate !== undefined) user.startDate = data.startDate;
    if (data.bankInfo !== undefined) user.bankInfo = data.bankInfo;
    if (data.emergencyContact !== undefined) user.emergencyContact = data.emergencyContact;
    if (data.homeAddress !== undefined) user.homeAddress = data.homeAddress;
    if (data.status !== undefined) user.status = data.status;
    if (data.contractType !== undefined) user.contractType = data.contractType;
    if (data.workingShift !== undefined) user.workingShift = data.workingShift;
    if (data.salaryInfo !== undefined) user.salaryInfo = data.salaryInfo;
    if (data.province !== undefined || data.district !== undefined || data.ward !== undefined || data.street !== undefined) {
      let defaultAddr = user.addresses.find((a: any) => a.isDefault);
      if (!defaultAddr && user.addresses.length > 0) defaultAddr = user.addresses[0];
      if (!defaultAddr) {
        user.addresses.push({
          isDefault: true, name: data.name || user.name, phone: data.phone || user.phone, province: data.province || "", district: data.district || "", ward: data.ward || "", street: data.street || ""
        } as any);
      } else {
        if (data.province !== undefined) defaultAddr.province = data.province;
        if (data.district !== undefined) defaultAddr.district = data.district;
        if (data.ward !== undefined) defaultAddr.ward = data.ward;
        if (data.street !== undefined) defaultAddr.street = data.street;
      }
    }
    await this.userRepo.save(user);
    return mapUser(user);
  }

  async updateInternalNotes(id: string, internalNotes: string) {
    const user = await this.userRepo.findById(id);
    if (!user) throw notFound("User not found");
    user.internalNotes = internalNotes;
    await this.userRepo.save(user);
    return mapUser(user);
  }

  async updateStaffInternalNotes(id: string, internalNotes: string, requester: UserDocument) {
    const user = await this.userRepo.findById(id);
    if (!user) throw notFound("User not found");
    this.checkHierarchy(requester, user);
    user.internalNotes = internalNotes;
    await this.userRepo.save(user);
    return mapUser(user);
  }

  async updateUserRole(id: string, role: "manager" | "staff", permissions: string[] | undefined, requester: UserDocument) {
    const user = await this.userRepo.findById(id);
    if (!user) throw notFound("User not found");
    if (user.role === "owner") throw conflict("Cannot change the permissions of the Owner");
    this.checkHierarchy(requester, user);
    let newRole = role;
    if (requester.role === "manager" && role === "manager") newRole = "staff";
    if (newRole) user.role = newRole;
    if (permissions) user.permissions = permissions as any[];
    await this.userRepo.save(user);
    return mapUser(user);
  }

  async updateUserStatus(id: string, isActive: boolean, requester: UserDocument) {
    const user = await this.userRepo.findById(id);
    if (!user) throw notFound("User not found");
    if (user.role === "owner") throw conflict("Cannot lock the Owner account");
    this.checkHierarchy(requester, user);
    user.isActive = isActive;
    await this.userRepo.save(user);
    return mapUser(user);
  }

  async resetUserPassword(id: string, requester: UserDocument) {
    const user = await this.userRepo.findById(id);
    if (!user) throw notFound("User not found");
    if (user.role === "owner") throw conflict("Cannot operate on the Owner account");
    this.checkHierarchy(requester, user);
    const defaultPassword = process.env.DEFAULT_STAFF_PASSWORD || "GlowUp@123456";
    user.password = await bcrypt.hash(defaultPassword, 12);
    await this.userRepo.save(user);
    return mapUser(user);
  }

  async deleteUserById(id: string, requester: UserDocument) {
    const user = await this.userRepo.findById(id);
    if (!user) throw notFound("User not found");
    if (user.role === "owner") throw conflict("Cannot delete the Owner account");
    this.checkHierarchy(requester, user);
    if (user.role === "customer") {
      const activeOrder = await Order.findOne({
        userId: id,
        orderStatus: { $in: ["pending", "processing", "shipping", "return_pending"] },
      });
      if (activeOrder) throw conflict("Cannot delete. This customer has uncompleted or pending return orders.");
    }
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
    user.internalNotes = `Deleted by the system at ${new Date().toISOString()}`;
    user.isActive = false;
    await this.userRepo.save(user);
  }

  async createStaff(data: any, requester: UserDocument) {
    const existingPhone = await this.userRepo.findByPhone(data.phone);
    if (existingPhone) throw conflict("Phone number already exists");
    if (data.email) {
      const existingEmail = await this.userRepo.findByEmail(data.email);
      if (existingEmail) throw conflict("Email already exists");
    }
    let finalRole = data.role || "staff";
    if (requester.role === "manager") finalRole = "staff";
    const hashedPassword = await bcrypt.hash(data.password || "123456", 12);
    const lastStaff = await User.findOne({ employeeId: { $regex: /^NV[0-9]{4}$/ } }).sort({ employeeId: -1 }).select("employeeId").lean();
    let nextNum = 1;
    if (lastStaff && lastStaff.employeeId) {
      const match = lastStaff.employeeId.match(/^NV([0-9]{4})$/);
      if (match) nextNum = parseInt(match[1]) + 1;
    }
    const employeeId = `NV${String(nextNum).padStart(4, "0")}`;
    const newUser = await this.userRepo.create({
      name: data.name, email: data.email || undefined, phone: data.phone, password: hashedPassword, role: finalRole, permissions: data.permissions || [], citizenId: data.citizenId || undefined, startDate: data.startDate || undefined, bankInfo: data.bankInfo || undefined, emergencyContact: data.emergencyContact || undefined, homeAddress: data.homeAddress || undefined, employeeId, status: data.status || "working", contractType: data.contractType || "fulltime", workingShift: data.workingShift || "full", salaryInfo: data.salaryInfo || { baseSalary: 0, allowance: 0, commissionRate: 0 },
    });
    return mapUser(newUser);
  }

  async getCustomers(page = 1, limit = 20, search?: string, tier?: string, status?: string, spending?: string, lastPurchase?: string, sortBy?: string, source?: string, startDate?: string, endDate?: string) {
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const ninetyDaysAgo = new Date(); ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const oneEightyDaysAgo = new Date(); oneEightyDaysAgo.setDate(oneEightyDaysAgo.getDate() - 180);
    const threeSixtyFiveDaysAgo = new Date(); threeSixtyFiveDaysAgo.setDate(threeSixtyFiveDaysAgo.getDate() - 365);
    const [overviewResult] = await User.aggregate([
      { $match: { role: "customer" } },
      { $lookup: { from: "orders", localField: "_id", foreignField: "userId", as: "orders" } },
      { $project: { createdAt: 1, completedOrders: { $filter: { input: "$orders", as: "order", cond: { $eq: ["$$order.orderStatus", "completed"] } } } } },
      { $addFields: { orderCount: { $size: "$completedOrders" }, lastPurchaseDate: { $max: "$completedOrders.createdAt" } } },
      { $group: { _id: null, totalCustomers: { $sum: 1 }, newCustomers: { $sum: { $cond: [{ $gte: ["$createdAt", thirtyDaysAgo] }, 1, 0] } }, returningCustomers: { $sum: { $cond: [{ $gte: ["$orderCount", 2] }, 1, 0] } }, churningCustomers: { $sum: { $cond: [ { $and: [ { $gte: ["$orderCount", 1] }, { $lt: ["$lastPurchaseDate", ninetyDaysAgo] } ] }, 1, 0 ] } } } }
    ]);
    const overview = overviewResult || { totalCustomers: 0, newCustomers: 0, returningCustomers: 0, churningCustomers: 0 };
    const match: any = { role: "customer" };
    if (search) match.$or = [ { name: { $regex: search, $options: "i" } }, { phone: { $regex: search, $options: "i" } }, { email: { $regex: search, $options: "i" } } ];
    if (status && status !== "all") match.isActive = status === "active";
    if (source && source !== "all") match.password = source === "web" ? { $exists: true, $ne: null } : { $exists: false };
    const pipeline: any[] = [
      { $match: match },
      { $lookup: { from: "orders", localField: "_id", foreignField: "userId", as: "orders" } },
      { $project: { name: 1, email: 1, phone: 1, points: 1, isActive: 1, createdAt: 1, password: 1, providers: 1, province: 1, district: 1, ward: 1, street: 1, completedOrders: { $filter: { input: "$orders", as: "order", cond: { $eq: ["$$order.orderStatus", "completed"] } } } } },
      { $addFields: { orderCount: { $size: "$completedOrders" }, totalSpent: { $sum: "$completedOrders.totalAmount" }, lastPurchaseDate: { $max: "$completedOrders.createdAt" }, hasOnlineAccount: { $cond: [ { $or: [ { $ifNull: ["$password", false] }, { $gt: [{ $size: { $ifNull: ["$providers", []] } }, 0] } ] }, true, false ] } } }
    ];
    const postMatch: any = {};
    if (spending && spending !== "all") {
      if (spending === "0") postMatch.totalSpent = 0;
      else if (spending === "under_1m") postMatch.totalSpent = { $gt: 0, $lt: 1000000 };
      else if (spending === "1m_to_5m") postMatch.totalSpent = { $gte: 1000000, $lte: 5000000 };
      else if (spending === "over_5m") postMatch.totalSpent = { $gt: 5000000 };
    }
    if (tier && tier !== "all") {
      const tierDef = TIERS.find((t) => t.key === tier);
      if (tierDef) {
        const nextTierDef = TIERS[TIERS.indexOf(tierDef) - 1];
        if (nextTierDef) postMatch.totalSpent = { $gte: tierDef.minSpent, $lt: nextTierDef.minSpent };
        else postMatch.totalSpent = { $gte: tierDef.minSpent };
      }
    }
    if (lastPurchase && lastPurchase !== "all") {
      if (lastPurchase === "30_days") postMatch.lastPurchaseDate = { $gte: thirtyDaysAgo };
      else if (lastPurchase === "90_days") postMatch.lastPurchaseDate = { $lt: thirtyDaysAgo, $gte: ninetyDaysAgo };
      else if (lastPurchase === "180_days") postMatch.lastPurchaseDate = { $lt: ninetyDaysAgo, $gte: oneEightyDaysAgo };
      else if (lastPurchase === "365_days") postMatch.lastPurchaseDate = { $lt: oneEightyDaysAgo, $gte: threeSixtyFiveDaysAgo };
      else if (lastPurchase === "over_365_days") postMatch.lastPurchaseDate = { $lt: threeSixtyFiveDaysAgo };
      else if (lastPurchase === "custom") {
        const customMatch: any = {};
        if (startDate) customMatch.$gte = new Date(startDate);
        if (endDate) { const end = new Date(endDate); end.setHours(23, 59, 59, 999); customMatch.$lte = end; }
        if (Object.keys(customMatch).length > 0) postMatch.lastPurchaseDate = customMatch;
      }
    }
    if (Object.keys(postMatch).length > 0) pipeline.push({ $match: postMatch });
    let sortStage: any = { createdAt: -1 };
    if (sortBy) {
      if (sortBy === "spent_high" || sortBy === "spent_desc") sortStage = { totalSpent: -1, createdAt: -1 };
      else if (sortBy === "spent_low") sortStage = { totalSpent: 1, createdAt: -1 };
      else if (sortBy === "points_high" || sortBy === "points_desc") sortStage = { points: -1, createdAt: -1 };
      else if (sortBy === "points_low") sortStage = { points: 1, createdAt: -1 };
      else if (sortBy === "new_customer") sortStage = { createdAt: -1 };
      else if (sortBy === "old_customer") sortStage = { createdAt: 1 };
    }
    pipeline.push({ $sort: sortStage });
    const skip = (page - 1) * limit;
    pipeline.push({ $facet: { data: [ { $skip: skip }, { $limit: limit }, { $project: { completedOrders: 0, password: 0 } } ], totalCount: [{ $count: "count" }] } });
    const [result] = await User.aggregate(pipeline);
    const customers = result.data.map((u: any) => {
      const defaultAddress = (u.addresses || []).find((a: any) => a.isDefault) || (u.addresses || [])[0] || {};
      const currentTier = getTierBySpending(u.totalSpent || 0);
      return { id: u._id.toString(), name: u.name, email: u.email, phone: u.phone, points: u.points || 0, isActive: u.isActive, hasOnlineAccount: u.hasOnlineAccount, orderCount: u.orderCount, totalSpent: u.totalSpent, tier: currentTier.key, createdAt: u.createdAt, lastPurchaseDate: u.lastPurchaseDate || null, province: defaultAddress.province || "", district: defaultAddress.district || "", ward: defaultAddress.ward || "", street: defaultAddress.street || "" };
    });
    const totalElements = result.totalCount[0]?.count || 0;
    return { overview: { totalCustomers: overview.totalCustomers || 0, newCustomers: overview.newCustomers || 0, returningCustomers: overview.returningCustomers || 0, churningCustomers: overview.churningCustomers || 0 }, content: customers, totalPages: Math.ceil(totalElements / limit), totalElements, page, limit };
  }

  async createManualCustomer(data: any) {
    const existing = await this.userRepo.findByPhone(data.phone);
    if (existing) throw conflict("Phone number already exists");
    const hashedPassword = data.password ? await bcrypt.hash(data.password, 12) : undefined;
    const newUser = await this.userRepo.create({ name: data.name, email: data.email || undefined, phone: data.phone, password: hashedPassword, role: "customer", permissions: [] });
    return mapUser(newUser);
  }

  async adjustUserPoints(id: string, pointsChanged: number, reason: string, performedBy: string) {
    const user = await this.userRepo.findById(id);
    if (!user) throw notFound("User not found");
    const newPoints = user.points + pointsChanged;
    if (newPoints < 0) throw conflict("Points cannot be negative");
    user.points = newPoints;
    await this.userRepo.save(user);
    await PointHistory.create({ userId: user._id, pointsChanged, reason, performedBy });
    return mapUser(user);
  }

  async getUserPointHistory(userId: string) {
    return await PointHistory.find({ userId }).populate("performedBy", "name email").sort({ createdAt: -1 }).lean();
  }

  async getFavorites(userId: string) {
    const user = await this.userRepo.findById(userId);
    if (!user) throw notFound("User not found");
    await user.populate({ path: "favorites", populate: [ { path: "brandId", select: "name" }, { path: "categoryId", select: "name" } ] });
    const products = (user.favorites || []) as any[];
    const productsWithVariants = await this.productRepo.attachVariants(products);
    return productsWithVariants.map((p) => mapProduct(p));
  }

  async toggleFavorite(userId: string, productId: string) {
    const user = await this.userRepo.findById(userId);
    if (!user) throw notFound("User not found");
    const productObjectId = new mongoose.Types.ObjectId(productId);
    const favorites = user.favorites || [];
    const index = favorites.findIndex((id) => id.toString() === productId);
    if (index !== -1) favorites.splice(index, 1);
    else favorites.push(productObjectId);
    user.favorites = favorites;
    await this.userRepo.save(user);
    return { action: index !== -1 ? "removed" : "added" };
  }

  async getRecentlyViewed(userId: string, page = 1, limit = 12) {
    const user = await this.userRepo.findById(userId);
    if (!user) throw notFound("User not found");
    await user.populate({ path: "recentlyViewed", populate: [ { path: "brandId", select: "name" }, { path: "categoryId", select: "name" } ] });
    const all = (user.recentlyViewed || []) as any[];
    const total = all.length;
    const totalPages = Math.ceil(total / limit);
    const sliced = all.slice((page - 1) * limit, page * limit);
    const withVariants = await this.productRepo.attachVariants(sliced);
    return { products: withVariants.map((p) => mapProduct(p)), total, page, limit, totalPages };
  }

  async recordRecentlyViewed(userId: string, productId: string) {
    const user = await this.userRepo.findById(userId);
    if (!user) throw notFound("User not found");
    const productObjectId = new mongoose.Types.ObjectId(productId);
    const viewed = user.recentlyViewed || [];
    const index = viewed.findIndex((id) => id.toString() === productId);
    if (index !== -1) viewed.splice(index, 1);
    viewed.unshift(productObjectId);
    if (viewed.length > 20) viewed.pop();
    user.recentlyViewed = viewed;
    await this.userRepo.save(user);
    return { success: true };
  }

  async removeFromViewed(userId: string, productId: string) {
    const user = await this.userRepo.findById(userId);
    if (!user) throw notFound("User not found");
    const viewed = user.recentlyViewed || [];
    const index = viewed.findIndex((id) => id.toString() === productId);
    if (index !== -1) { viewed.splice(index, 1); user.recentlyViewed = viewed; await this.userRepo.save(user); }
    return { success: true };
  }

  async clearRecentlyViewed(userId: string) {
    const user = await this.userRepo.findById(userId);
    if (!user) throw notFound("User not found");
    user.recentlyViewed = [];
    await this.userRepo.save(user);
    return { success: true };
  }

  async deleteUser(targetUserId: string, currentUser: UserDocument) {
    if (targetUserId === currentUser._id.toString()) throw forbidden("You cannot delete yourself");
    const targetUser = await this.userRepo.findById(targetUserId);
    if (!targetUser) throw notFound("User not found");
    if (targetUser.role === "owner") throw forbidden("Cannot delete the store owner account");
    // Emit event — ReviewService handles cascading cleanup within its own context
    await eventBus.emitAsync("user.deleted", { userId: targetUserId });
    await User.findByIdAndDelete(targetUserId);
    return { success: true };
  }

  async getOrCreateGuestUser(phone: string, name: string, session?: mongoose.ClientSession, role: string = "guest"): Promise<UserDocument> {
    let customerUser = await User.findOne({ phone }).session(session ?? null);
    if (!customerUser) {
      const generatedPassword = `KH_${Math.random().toString(36).substring(2, 8)}`;
      const hashedPassword = await bcrypt.hash(generatedPassword, 10);
      const created = await User.create(
        [
          {
            phone,
            name: name || "Khách lẻ",
            password: hashedPassword,
            role,
          },
        ],
        { session }
      );
      customerUser = created[0];
    }
    return customerUser;
  }

  async getUserByPhone(phone: string): Promise<UserDocument | null> {
    return User.findOne({ phone });
  }

  async getUserEmail(userId: string): Promise<{ email: string | null }> {
    const user = await User.findById(userId).select("email").lean();
    return { email: user?.email || null };
  }

  async getUserPoints(userId: string): Promise<number> {
    const user = await User.findById(userId).select("points").lean();
    return user?.points || 0;
  }
}
