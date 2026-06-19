import { z } from "zod";

export const UpdateProfileSchema = z.object({
  name:    z.string().min(1).trim().optional(),
  phone:   z.string().regex(/^[0-9]{9,11}$/).trim().optional(),
  dob:     z.string().datetime().or(z.date()).optional(),
  gender:  z.enum(["male", "female", "other"]).optional(),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

import { PERMISSIONS } from "../../../models/user.schema.js";

export const UpdateRoleSchema = z.object({
  role: z.enum(["manager", "staff"]).optional(),
  permissions: z.array(z.enum([PERMISSIONS[0], ...PERMISSIONS.slice(1)])).optional(),
});

export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>;

export const CreateStaffSchema = z.object({
  name: z.string().min(1).trim(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().regex(/^[0-9]{9,11}$/).trim(),
  password: z.string().min(6).optional(),
  role: z.enum(["manager", "staff"]),
  permissions: z.array(z.enum([PERMISSIONS[0], ...PERMISSIONS.slice(1)])).optional(),
});

export type CreateStaffInput = z.infer<typeof CreateStaffSchema>;

export const UpdateStatusSchema = z.object({
  isActive: z.boolean(),
});

export type UpdateStatusInput = z.infer<typeof UpdateStatusSchema>;

export const AddressSchema = z.object({
  province: z.string().trim().min(1, "Vui lòng chọn Tỉnh/Thành"),
  district: z.string().trim().min(1, "Vui lòng chọn Quận/Huyện"),
  ward: z.string().trim().min(1, "Vui lòng chọn Phường/Xã"),
  street: z.string().trim().min(1, "Vui lòng nhập Đường/Số nhà"),
  isDefault: z.boolean().optional().default(false),
});

export type AddressInput = z.infer<typeof AddressSchema>;
