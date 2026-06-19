import User, { type UserDocument, type IUser } from "../../models/user.schema.js";

export const findAll = () =>
  User.find().select("-password").sort({ createdAt: -1 }).lean();

export const findStaffs = async (
  page: number = 1,
  limit: number = 20,
  search?: string,
  status?: string,
  role?: string
) => {
  const query: any = { role: { $in: ["owner", "manager", "staff"] } };

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

  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    User.find(query).select("-password").sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(query),
  ]);

  return { users, total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const findById = (id: string) =>
  User.findById(id).select("-password");

export const findByEmail = (email: string) =>
  User.findOne({ email });

export const findByPhone = (phone: string) =>
  User.findOne({ phone });

export const create = (data: Partial<IUser>) =>
  User.create(data);

export const save = (user: UserDocument) =>
  user.save();

export const deleteById = (id: string) =>
  User.findByIdAndDelete(id);

export const updateById = (id: string, data: Partial<IUser>) =>
  User.findByIdAndUpdate(id, data, { returnDocument: "after" }).select("-password").lean();

export const findCustomers = () =>
  User.find({ role: "customer" }).select("-password").sort({ createdAt: -1 }).lean();
