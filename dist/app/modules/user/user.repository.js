import User from "../../models/user/user.schema.js";
import Otp from "../../models/user/otp.schema.js";
export const findAll = () => User.find({ isDeleted: { $ne: true } }).select("-password").sort({ createdAt: -1 }).lean();
export const findStaffs = async (cursor = null, limit = 20, search, status, role) => {
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
