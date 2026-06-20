import User from "../../models/user.schema.js";
export const findByPhone = (phone) => User.findOne({ phone });
export const findByEmail = (email) => User.findOne({ email });
export const findByIdWithPassword = (id) => User.findById(id);
export const findByIdSafe = (id) => User.findById(id).select("-password");
// Cần select thêm resetToken + resetTokenExpiry vì schema có select:false
export const findByEmailWithResetToken = (email) => User.findOne({ email }).select("+resetToken +resetTokenExpiry");
export const findByPhoneWithResetToken = (phone) => User.findOne({ phone }).select("+resetToken +resetTokenExpiry");
export const findByResetToken = (token) => User.findOne({ resetToken: token }).select("+resetToken +resetTokenExpiry");
export const create = (data) => User.create(data);
export const save = (user) => user.save();
// Cần select thêm refreshToken vì schema có select:false
export const findByIdWithRefreshToken = (id) => User.findById(id).select("+refreshToken");
