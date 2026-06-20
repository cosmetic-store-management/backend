import { z } from "zod";
export const CreateBrandSchema = z.object({
    name: z.string().min(1, "Tên thương hiệu không được để trống").trim(),
    description: z.string().trim().optional().default(""),
    imageUrl: z.string().trim().optional().default(""),
    country: z.string().trim().optional().default(""),
    isActive: z.boolean().optional().default(true),
});
export const UpdateBrandSchema = CreateBrandSchema.partial().refine((data) => Object.keys(data).length > 0, "Vui lòng cung cấp ít nhất một thông tin cần cập nhật");
export const UpdateBrandStatusSchema = z.object({
    isActive: z.boolean(),
});
