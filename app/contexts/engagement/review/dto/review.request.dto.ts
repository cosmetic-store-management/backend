import { z } from "zod";

export const CreateReviewSchema = z.object({
  productId: z.string().min(1, "Please select a product"),
  rating: z
    .number()
    .int()
    .min(1, "Minimum rating is 1")
    .max(5, "Maximum rating is 5"),
  comment: z.string().trim().optional().default(""),
  images: z
    .array(z.string().url("Invalid image URL"))
    .optional()
    .default([]),
  videos: z
    .array(z.string().url("Invalid video URL"))
    .optional()
    .default([]),
});

export type CreateReviewInput = z.infer<typeof CreateReviewSchema>;
