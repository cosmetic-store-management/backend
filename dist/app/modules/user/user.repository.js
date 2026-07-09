import User from "./models/user.schema.js";
import Otp from "../auth/models/otp.schema.js";
export const findAll = () => User.find({ isDeleted: { $ne: true } }).select("-password").sort({ createdAt: -1 }).lean();
export const findStaffs = async (page = 1, limit = 20, search, status, role, hiringStatus, workingShift) => {
    const query = { role: { $in: ["owner", "manager", "staff"] }, isDeleted: { $ne: true } };
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
    const rolePriority = { owner: 3, manager: 2, staff: 1 };
    const sortedUsers = [...users].sort((a, b) => {
        const prioA = rolePriority[a.role] ?? 0;
        const prioB = rolePriority[b.role] ?? 0;
        if (prioA !== prioB)
            return prioB - prioA;
        return b._id.toString().localeCompare(a._id.toString());
    });
    const totalPages = Math.ceil(total / limit);
    return { users: sortedUsers, total, limit, page, totalPages };
};
export const findById = (id) => User.findById(id).select("-password");
export const findByEmail = (email) => User.findOne({ email, isDeleted: { $ne: true } });
export const findByPhone = (phone) => User.findOne({ phone, isDeleted: { $ne: true } });
export const create = (data) => User.create(data);
export const save = (user) => user.save();
export const deleteById = (id) => User.findByIdAndDelete(id);
export const updateById = (id, data) => User.findByIdAndUpdate(id, data, { returnDocument: "after" })
    .select("-password")
    .lean();
export const findCustomers = () => User.find({ role: "customer", isDeleted: { $ne: true } })
    .select("-password")
    .sort({ createdAt: -1 })
    .lean();
export const findOtpByPhone = (phone) => Otp.findOne({ phone });
export const upsertOtp = (phone, otpCode, expiresAt) => Otp.findOneAndUpdate({ phone }, { otpCode, expiresAt, isVerified: false }, { upsert: true, returnDocument: "after" });
export const markOtpVerified = (phone) => Otp.findOneAndUpdate({ phone }, { isVerified: true }, { returnDocument: "after" });
export const deleteOtp = (phone) => Otp.findOneAndDelete({ phone });
