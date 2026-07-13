import { injectable } from "tsyringe";
import User, { type UserDocument, type IUser } from "./models/user.schema.js";
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

  findById(id: string) {
    return User.findById(id).select("-password");
  }

  findByEmail(email: string) {
    return User.findOne({ email, isDeleted: { $ne: true } });
  }

  findByPhone(phone: string) {
    return User.findOne({ phone, isDeleted: { $ne: true } });
  }

  create(data: Partial<IUser>) {
    return User.create(data);
  }

  save(user: UserDocument) {
    return user.save();
  }

  deleteById(id: string) {
    return User.findByIdAndDelete(id);
  }

  updateById(id: string, data: Partial<IUser>) {
    return User.findByIdAndUpdate(id, data, { returnDocument: "after" })
      .select("-password")
      .lean();
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
