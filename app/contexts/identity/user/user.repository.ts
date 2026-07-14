import { injectable } from "tsyringe";
import User, { type UserDocument, type IUser } from "./models/user.schema.js";
import PointHistory from "./models/point-history.schema.js";
import mongoose from "mongoose";
import Otp, { type IOtp } from "../auth/models/otp.schema.js";

@injectable()
export class UserRepository {
  findAll() {
    return User.find({ isDeleted: { $ne: true } })
      .select("-password")
      .sort({ createdAt: -1 })
      .lean();
  }

  async findStaffs(
    page: number = 1,
    limit: number = 20,
    search?: string,
    status?: string,
    role?: string,
    hiringStatus?: string,
    workingShift?: string,
  ) {
    const query: any = { role: { $in: ["owner", "manager", "staff"] }, isDeleted: { $ne: true } };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    if (status) {
      query.isActive = status === "active";
    }

    if (role) {
      query.role = role;
    }

    if (hiringStatus) {
      query.status = hiringStatus;
    }

    if (workingShift) {
      query.workingShift = workingShift;
    }

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find(query)
        .select("-password")
        .sort({ _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    const rolePriority: Record<string, number> = { owner: 3, manager: 2, staff: 1 };
    const sortedUsers = [...users].sort((a, b) => {
      const prioA = rolePriority[a.role] ?? 0;
      const prioB = rolePriority[b.role] ?? 0;
      if (prioA !== prioB) return prioB - prioA;
      return b._id.toString().localeCompare(a._id.toString());
    });

    const totalPages = Math.ceil(total / limit);

    return { users: sortedUsers, total, limit, page, totalPages };
  }

  findById(id: string | mongoose.Types.ObjectId, select?: string) {
    if (select) {
      return User.findById(id).select(select);
    }
    return User.findById(id);
  }

  findActiveManagers() {
    return User.find({
      role: { $in: ["owner", "manager"] },
      isActive: true,
      isDeleted: { $ne: true }
    }).select("email").lean();
  }

  findByEmail(email: string, session?: mongoose.ClientSession) {
    return User.findOne({ email, isDeleted: { $ne: true } }).session(session || null);
  }

  findByPhone(phone: string, session?: mongoose.ClientSession) {
    return User.findOne({ phone, isDeleted: { $ne: true } }).session(session || null);
  }

  findOneBy(query: any, session?: mongoose.ClientSession) {
    return User.findOne(query).session(session || null);
  }

  create(data: Partial<IUser>) {
    return User.create(data);
  }

  createPointHistories(data: any[], session?: mongoose.ClientSession) {
    return PointHistory.create(data, { session });
  }

  findPointHistories(query: any, skip: number = 0, limit: number = 10) {
    return PointHistory.find(query)
      .populate("performedBy", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
  }

  countPointHistories(query: any) {
    return PointHistory.countDocuments(query);
  }

  save(user: UserDocument) {
    return user.save();
  }

  
  findOneAndUpdate(query: any, update: any, options?: any) {
    return User.findOneAndUpdate(query, update, options);
  }

  aggregate(pipeline: any[]) {
    return User.aggregate(pipeline);
  }

  findLatestStaff() {
    return User.findOne({ employeeId: { $regex: /^NV[0-9]{4}$/ } }).sort({ employeeId: -1 }).select("employeeId").lean();
  }

  createWithSession(data: any[], session?: mongoose.ClientSession) {
    return User.create(data, { session });
  }

  deleteById(id: string) {
    return User.findByIdAndDelete(id);
  }

  async updateById(id: string, data: Partial<IUser>): Promise<UserDocument | null> {
    return User.findByIdAndUpdate(id, data, { new: true }).lean();
  }

  async addSavedVoucher(userId: string, voucherId: mongoose.Types.ObjectId): Promise<UserDocument | null> {
    return User.findByIdAndUpdate(
      userId,
      { $addToSet: { savedVouchers: voucherId } } as any,
      { new: true }
    ).lean();
  }

  async removeSavedVoucher(userId: string, voucherId: mongoose.Types.ObjectId): Promise<UserDocument | null> {
    return User.findByIdAndUpdate(
      userId,
      { $pull: { savedVouchers: voucherId } } as any,
      { new: true }
    ).lean();
  }

  findCustomers() {
    return User.find({ role: "customer", isDeleted: { $ne: true } })
      .select("-password")
      .sort({ createdAt: -1 })
      .lean();
  }

  findOtpByPhone(phone: string) {
    return Otp.findOne({ phone });
  }

  upsertOtp(phone: string, otpCode: string, expiresAt: Date) {
    return Otp.findOneAndUpdate(
      { phone },
      { otpCode, expiresAt, isVerified: false },
      { upsert: true, returnDocument: "after" }
    );
  }

  markOtpVerified(phone: string) {
    return Otp.findOneAndUpdate(
      { phone },
      { isVerified: true },
      { returnDocument: "after" }
    );
  }

  deleteOtp(phone: string) {
    return Otp.findOneAndDelete({ phone });
  }
}
