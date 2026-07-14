import { z } from "zod";

export const CreateCategorySchema = z.object({
  name: z.string().min(1, "Category name cannot be empty").trim(),
  description: z.string().trim().optional().default(""),
  imageUrl: z.string().trim().optional().default(""),
  iconUrl: z.string().trim().optional().default(""),
  bannerUrl: z.string().trim().optional().default(""),
  parentId: z.string().trim().optional().nullable().default(null),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().min(0).optional().default(0),
});

export const UpdateCategorySchema = CreateCategorySchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  "Please provide at least one field to update",
);

export const UpdateCategoryStatusSchema = z.object({
  isActive: z.boolean(),
});

export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof UpdateCategorySchema>;
export type UpdateCategoryStatusInput = z.infer<
  typeof UpdateCategoryStatusSchema
>;
