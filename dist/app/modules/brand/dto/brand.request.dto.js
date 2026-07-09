import { z } from "zod";
export const CreateBrandSchema = z.object({
    name: z.string().min(1, "Brand name cannot be empty").trim(),
    description: z.string().trim().optional().default(""),
    imageUrl: z.string().trim().optional().default(""),
    country: z.string().trim().optional().default(""),
    isActive: z.boolean().optional().default(true),
    website: z.string().trim().optional().default(""),
    contactPhone: z.string().trim().optional().default(""),
    contactEmail: z.string().trim().optional().default(""),
    supplierName: z.string().trim().optional().default(""),
    minimumOrderValue: z.number().optional().default(0),
    leadTimeDays: z.number().optional().default(7),
});
export const UpdateBrandSchema = CreateBrandSchema.partial().refine((data) => Object.keys(data).length > 0, "Please provide at least one field to update");
export const UpdateBrandStatusSchema = z.object({
    isActive: z.boolean(),
});
