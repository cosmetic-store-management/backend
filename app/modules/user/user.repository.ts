import User, {
  type UserDocument,
  type IUser,
} from "./models/user.schema.js";
import Otp, { type IOtp } from "../auth/models/otp.schema.js";

export const findAll = () =>
  User.find({ isDeleted: { $ne: true } }).select("-password").sort({ createdAt: -1 }).lean();

export const findStaffs = async (
  cursor: string | null = null,
  limit: number = 20,
  search?: string,
  status?: string,
  role?: string,
) => {
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

  if (cursor) {
    query._id = { $lt: cursor };
  }

  const [users, total] = await Promise.all([
    User.find(query)
      .select("-password")
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean(),
    // Vẫn đếm total để FE hiển thị "Tổng số: X" nếu cần (tuy nhiên countDocuments chạy khá nặng với DB siêu lớn)
    User.countDocuments(query),
  ]);

  const hasNextPage = users.length > limit;
  const items = hasNextPage ? users.slice(0, limit) : users;
  const nextCursor = hasNextPage ? items[items.length - 1]._id.toString() : null;

  return { users: items, total, limit, nextCursor, hasNextPage };
};

export const findById = (id: string) => User.findById(id).select("-password");

export const findByEmail = (email: string) => User.findOne({ email, isDeleted: { $ne: true } });

export const findByPhone = (phone: string) => User.findOne({ phone, isDeleted: { $ne: true } });

export const create = (data: Partial<IUser>) => User.create(data);

export const save = (user: UserDocument) => user.save();

export const deleteById = (id: string) => User.findByIdAndDelete(id);

export const updateById = (id: string, data: Partial<IUser>) =>
  User.findByIdAndUpdate(id, data, { returnDocument: "after" })
    .select("-password")
    .lean();

export const findCustomers = () =>
  User.find({ role: "customer", isDeleted: { $ne: true } })
    .select("-password")
    .sort({ createdAt: -1 })
    .lean();

export const findOtpByPhone = (phone: string) => Otp.findOne({ phone });

export const upsertOtp = (phone: string, otpCode: string, expiresAt: Date) =>
  Otp.findOneAndUpdate(
    { phone },
    { otpCode, expiresAt, isVerified: false },
    { upsert: true, returnDocument: "after" }
  );

export const markOtpVerified = (phone: string) =>
  Otp.findOneAndUpdate({ phone }, { isVerified: true }, { returnDocument: "after" });

export const deleteOtp = (phone: string) => Otp.findOneAndDelete({ phone });
