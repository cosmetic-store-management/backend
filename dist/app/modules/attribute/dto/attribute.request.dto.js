import { z } from "zod";
export const CreateAttributeSchema = z.object({
    name: z.string().min(1, "Tên thuộc tính không được để trống").trim(),
    code: z.string().min(1, "Mã code không được để trống").trim().toLowerCase(),
    values: z.array(z.string()).optional().default([]),
});
export const UpdateAttributeSchema = z
    .object({
    name: z.string().min(1).trim().optional(),
    values: z.array(z.string()).optional(),
})
    .refine((data) => Object.keys(data).length > 0, "Vui lòng cung cấp ít nhất một thông tin cần cập nhật");
