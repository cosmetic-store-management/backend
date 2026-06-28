import { z } from "zod";
export const BaseVoucherSchema = z.object({
    code: z
        .string()
        .min(3, "Mã giảm giá phải có ít nhất 3 ký tự")
        .trim()
        .toUpperCase(),
    discountType: z.enum(["percent", "fixed", "freeship"]),
    discountValue: z.number().min(0, "Giá trị giảm không được âm"),
    minOrderValue: z.number().min(0).optional().default(0),
    maxDiscount: z.number().min(0).optional(),
    startDate: z.string().datetime("Ngày bắt đầu không hợp lệ"),
    endDate: z.string().datetime("Ngày kết thúc không hợp lệ"),
    usageLimit: z.number().min(0).optional().default(0),
    isActive: z.boolean().optional().default(true),
});
export const CreateVoucherSchema = BaseVoucherSchema.refine((data) => {
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    return start < end;
}, {
    message: "Ngày kết thúc phải sau ngày bắt đầu",
    path: ["endDate"],
}).refine((data) => {
    if (data.discountType === "percent" && data.discountValue > 100) {
        return false;
    }
    return true;
}, {
    message: "Giá trị giảm không được vượt quá 100%",
    path: ["discountValue"],
});
export const UpdateVoucherSchema = BaseVoucherSchema.partial()
    .refine((data) => {
    if (data.startDate && data.endDate) {
        const start = new Date(data.startDate);
        const end = new Date(data.endDate);
        return start < end;
    }
    return true;
}, {
    message: "Ngày kết thúc phải sau ngày bắt đầu",
    path: ["endDate"],
})
    .refine((data) => {
    if (data.discountType === "percent" &&
        data.discountValue !== undefined &&
        data.discountValue > 100) {
        return false;
    }
    return true;
}, {
    message: "Giá trị giảm không được vượt quá 100%",
    path: ["discountValue"],
});
export const ValidateVoucherSchema = z.object({
    code: z.string().trim().toUpperCase(),
    subtotal: z.number().min(0),
});
