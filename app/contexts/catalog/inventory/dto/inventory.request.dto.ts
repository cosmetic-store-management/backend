import { z } from "zod";

// ── Supplier ──────────────────────────────────────────────────────────────────

export const CreateSupplierSchema = z.object({
  name: z.string().trim().min(1, "Supplier name is required"),
  phone: z.string().trim().min(1, "Phone number is required"),
  email: z.string().trim().email("Invalid email").or(z.literal("")).optional(),
  address: z.string().trim().optional(),
  taxCode: z.string().trim().optional(),
  contactPerson: z.string().trim().optional(),
  contactPhone: z.string().trim().optional(),
  contactEmail: z.string().trim().email("Invalid email").or(z.literal("")).optional(),
  contactPosition: z.string().trim().optional(),
  isActive: z.boolean().optional().default(true),
  notes: z.string().trim().optional(),
});

export const UpdateSupplierSchema = CreateSupplierSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  "Please provide at least one field to update",
);

// ── Goods Receipt ─────────────────────────────────────────────────────────────

export const GoodsReceiptItemSchema = z.object({
  variantId: z.string().min(1, "variantId is required"),
  quantity: z.number().int().positive("Quantity must be greater than 0"),
  importPrice: z.number().positive("Import price must be greater than 0"),
  batchCode: z.string().min(1, "Batch code is required"),
  manufactureDate: z.coerce.date({ message: "Manufacture date is required" }),
  expiryDate: z.coerce.date({ message: "Expiration date is required" }),
});

export const CreateGoodsReceiptSchema = z.object({
  supplierId: z.string().min(1, "supplierId is required"),
  items: z
    .array(GoodsReceiptItemSchema)
    .min(1, "Import order must have at least one product"),
});

// ── Stock Adjustment ──────────────────────────────────────────────────────────

export const AdjustStockSchema = z.object({
  variantId: z.string().min(1, "variantId is required"),
  actualStock: z.number().int().min(0, "Actual stock cannot be negative"),
  minStock: z.number().int().min(0, "Minimum limit cannot be negative"),
  reason: z.string().trim().optional(),
});

// ── Update Min Stock ──────────────────────────────────────────────────────────

export const UpdateMinStockSchema = z.object({
  variantId: z.string().min(1, "variantId is required"),
  minStock: z.number().int().min(0, "Minimum limit cannot be negative"),
});

// ── Types ─────────────────────────────────────────────────────────────────────

export type CreateSupplierInput = z.infer<typeof CreateSupplierSchema>;
export type CreateGoodsReceiptInput = z.infer<typeof CreateGoodsReceiptSchema>;
export type AdjustStockInput = z.infer<typeof AdjustStockSchema>;

