import { z } from "zod";

export const CreateProductSchema = z.object({
  name: z.string().min(1, "Product name cannot be empty").trim(),
  brand: z.string().trim().optional().default(""), // legacy — auto-filled from brandId
  brandId: z.string().min(1, "Brand cannot be empty"),
  description: z.string().trim().optional().default(""),
  imageUrl: z.string().trim().optional().default(""),
  imageUrls: z.array(z.string()).optional().default([]),
  categoryId: z.string().min(1, "Main category cannot be empty"),
  categoryIds: z.array(z.string()).optional().default([]), // secondary N:M categories
  isActive: z.boolean().optional().default(true),
  variants: z
    .array(
      z
        .object({
          id: z.string().optional(),
            name: z.string().min(1, "Variant name is required"),
          sku: z.string().optional(),
            price: z.number().min(0, "Invalid price"),
          stock: z.number().int().min(0, "Invalid quantity"),
            discountPrice: z.number().min(0).nullable().optional().default(null),
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
              message: "Discount price must be lower than the original price",
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

export const PublicProductQuerySchema = z.object({
  category: z.string().optional(),
  brandId: z.string().optional(),
  search: z.string().optional(),
  onSale: z.string().optional(),
  page: z.preprocess((val) => (val ? Number(val) : undefined), z.number().optional()),
  limit: z.preprocess((val) => (val ? Number(val) : undefined), z.number().optional()),
  minPrice: z.preprocess((val) => (val ? Number(val) : undefined), z.number().optional()),
  maxPrice: z.preprocess((val) => (val ? Number(val) : undefined), z.number().optional()),
  brands: z.string().optional(),
  sort: z.string().optional(),
});

export const AdminProductQuerySchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  brandId: z.string().optional(),
  status: z.string().optional(),
  minStock: z.preprocess((val) => (val ? Number(val) : undefined), z.number().optional()),
  maxStock: z.preprocess((val) => (val ? Number(val) : undefined), z.number().optional()),
  cursor: z.string().optional(),
  limit: z.preprocess((val) => (val ? Number(val) : undefined), z.number().optional()),
  page: z.preprocess((val) => (val ? Number(val) : undefined), z.number().optional()),
});
