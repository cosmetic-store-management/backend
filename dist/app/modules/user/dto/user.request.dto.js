import { z } from "zod";
export const UpdateProfileSchema = z.object({
    name: z.string().min(1).trim().optional(),
    email: z.string().email().optional().or(z.literal("")),
    phone: z
        .string()
        .regex(/^[0-9]{9,11}$/)
        .trim()
        .optional(),
    dob: z.string().datetime().or(z.date()).optional(),
    gender: z.enum(["male", "female", "other"]).optional(),
});
import { PERMISSIONS } from "../models/user.schema.js";
export const UpdateRoleSchema = z.object({
    role: z.enum(["manager", "staff"]).optional(),
    permissions: z
        .array(z.enum([PERMISSIONS[0], ...PERMISSIONS.slice(1)]))
        .optional(),
});
export const CreateStaffSchema = z.object({
    name: z.string().min(1).trim(),
    email: z.string().email().optional().or(z.literal("")),
    phone: z
        .string()
        .regex(/^[0-9]{9,11}$/)
        .trim(),
    password: z.string().min(6).optional(),
    role: z.enum(["manager", "staff"]),
    permissions: z
        .array(z.enum([PERMISSIONS[0], ...PERMISSIONS.slice(1)]))
        .optional(),
    citizenId: z.string().trim().optional().or(z.literal("")),
    startDate: z.preprocess((val) => (typeof val === 'string' && val ? new Date(val) : val), z.date().optional()),
    bankInfo: z
        .object({
        bankName: z.string().trim().optional().or(z.literal("")),
        accountNumber: z.string().trim().optional().or(z.literal("")),
        accountName: z.string().trim().optional().or(z.literal("")),
    })
        .optional(),
    emergencyContact: z
        .object({
        name: z.string().trim().optional().or(z.literal("")),
        phone: z.string().trim().optional().or(z.literal("")),
        relationship: z.string().trim().optional().or(z.literal("")),
    })
        .optional(),
    homeAddress: z.string().trim().optional().or(z.literal("")),
    status: z.enum(["working", "probation", "suspended", "resigned"]).optional(),
    contractType: z.enum(["fulltime", "parttime", "probationary", "internship"]).optional(),
    workingShift: z.enum(["morning", "afternoon", "night", "full"]).optional(),
    salaryInfo: z
        .object({
        baseSalary: z.number().optional().default(0),
        allowance: z.number().optional().default(0),
        commissionRate: z.number().optional().default(0),
    })
        .optional(),
});
export const UpdateStatusSchema = z.object({
    isActive: z.boolean(),
});
export const AddressSchema = z.object({
    province: z.string().trim().min(1, "Vui lòng chọn Tỉnh/Thành"),
    district: z.string().trim().min(1, "Vui lòng chọn Quận/Huyện"),
    ward: z.string().trim().min(1, "Vui lòng chọn Phường/Xã"),
    street: z.string().trim().min(1, "Vui lòng nhập Đường/Số nhà"),
    isDefault: z.boolean().optional().default(false),
});
