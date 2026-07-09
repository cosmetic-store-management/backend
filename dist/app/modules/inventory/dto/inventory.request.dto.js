import { z } from "zod";
// ── Supplier ──────────────────────────────────────────────────────────────────
export const CreateSupplierSchema = z.object({
    name: z.string().trim().min(1, "Tên nhà cung cấp là bắt buộc"),
    phone: z
        .string()
        .trim()
        .regex(/^[0-9]{9,11}$/, "Số điện thoại không hợp lệ"),
    email: z.string().trim().email("Invalid email").optional(),
    address: z.string().trim().optional(),
});
// ── Goods Receipt ─────────────────────────────────────────────────────────────
export const GoodsReceiptItemSchema = z.object({
    variantId: z.string().min(1, "variantId is required"),
    quantity: z.number().int().positive("Số lượng phải lớn hơn 0"),
    importPrice: z.number().positive("Giá nhập phải lớn hơn 0"),
    batchCode: z.string().min(1, "Mã lô là bắt buộc"),
    manufactureDate: z.coerce.date({ message: "Ngày sản xuất là bắt buộc" }),
    expiryDate: z.coerce.date({ message: "Hạn sử dụng là bắt buộc" }),
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
    actualStock: z.number().int().min(0, "Tồn kho thực tế không được âm"),
    minStock: z.number().int().min(0, "Minimum limit cannot be negative"),
    reason: z.string().trim().optional(),
});
// ── Update Min Stock ──────────────────────────────────────────────────────────
export const UpdateMinStockSchema = z.object({
    variantId: z.string().min(1, "variantId is required"),
    minStock: z.number().int().min(0, "Minimum limit cannot be negative"),
});
