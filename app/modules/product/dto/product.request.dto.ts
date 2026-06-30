import { z } from "zod";

export const CreateProductSchema = z.object({
  name: z.string().min(1, "Tên sản phẩm không được để trống").trim(),
  brand: z.string().trim().optional().default(""), // legacy — auto-filled from brandId
  brandId: z.string().min(1, "Thương hiệu không được để trống"),
  description: z.string().trim().optional().default(""),
  imageUrl: z.string().trim().optional().default(""),
  imageUrls: z.array(z.string()).optional().default([]),
  categoryId: z.string().min(1, "Danh mục chính không được để trống"),
  categoryIds: z.array(z.string()).optional().default([]), // secondary N:M categories
  isActive: z.boolean().optional().default(true),
  variants: z
    .array(
      z
        .object({
          id: z.string().optional(),
          name: z.string().min(1, "Tên biến thể không được để trống"),
          sku: z.string().optional(),
          price: z.number().min(0, "Giá không hợp lệ"),
          discountPrice: z.number().min(0).nullable().optional().default(null),
          stock: z.number().int().min(0, "Số lượng không hợp lệ"),
          minStock: z.number().int().optional().default(10),
          weight: z.number().int().optional().default(200),
          imageUrl: z.string().optional().default(""),
          attributes: z
            .array(z.object({ name: z.string(), value: z.string() }))
            .optional()
            .default([]),
          isActive: z.boolean().optional().default(true),
        })
        .refine(
          (data) => !data.discountPrice || data.discountPrice < data.price,
          {
            message: "Giá khuyến mãi phải nhỏ hơn giá gốc",
            path: ["discountPrice"],
          },
        ),
    ),
});

export const UpdateProductSchema = CreateProductSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  "Please provide at least one field to update",
);

export const UpdateProductStatusSchema = z.object({
  isActive: z.boolean(),
});

export type CreateProductInput = z.infer<typeof CreateProductSchema>;
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;
export type UpdateProductStatusInput = z.infer<
  typeof UpdateProductStatusSchema
>;
