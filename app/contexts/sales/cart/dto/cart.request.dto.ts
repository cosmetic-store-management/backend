import { z } from "zod";

export const addItemSchema = z.object({
  variantId: z.string().min(1, "Variant ID is required"),
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
});

export const updateItemSchema = z.object({
  variantId: z.string().min(1, "Variant ID is required"),
  quantity: z.number().int().min(1, "Quantity must be at least 1"),
});

export const syncCartSchema = z.object({
  items: z.array(
    z.object({
      variantId: z.string().min(1, "Variant ID is required"),
      quantity: z.number().int().min(1, "Quantity must be at least 1"),
    })
  ),
});

export type AddItemInput = z.infer<typeof addItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type SyncCartInput = z.infer<typeof syncCartSchema>;
