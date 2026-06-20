import { z } from "zod";
export const CreateCategorySchema = z.object({
    name: z.string().min(1, "Tên danh mục không được để trống").trim(),
    description: z.string().trim().optional().default(""),
    imageUrl: z.string().trim().optional().default(""),
    iconUrl: z.string().trim().optional().default(""),
    bannerUrl: z.string().trim().optional().default(""),
    parentId: z.string().trim().optional().nullable().default(null),
    isActive: z.boolean().optional().default(true),
    sortOrder: z.number().int().min(0).optional().default(0),
});
export const UpdateCategorySchema = CreateCategorySchema.partial().refine((data) => Object.keys(data).length > 0, "Vui lòng cung cấp ít nhất một thông tin cần cập nhật");
export const UpdateCategoryStatusSchema = z.object({
    isActive: z.boolean(),
});
