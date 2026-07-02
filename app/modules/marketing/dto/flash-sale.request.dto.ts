import { z } from "zod";

export const createFlashSaleSchema = z.object({
  name: z.string().min(1, "Program name is required"),
  startTime: z.string().datetime({ message: "Invalid start time" }),
  endTime: z.string().datetime({ message: "Invalid end time" }),
  isActive: z.boolean().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1, "Product ID is required"),
        variantId: z.string().min(1, "Variant ID is required"),
        flashPrice: z.number().min(0, "Flash sale price must be greater than or equal to 0"),
        quantityLimit: z.number().min(1, "Quantity limit must be greater than 0"),
      })
    )
    .min(1, "At least one product is required for a flash sale"),
});

export type CreateFlashSaleInput = z.infer<typeof createFlashSaleSchema>;
