import { z } from "zod";
// ── Supplier ──────────────────────────────────────────────────────────────────
export const CreateSupplierSchema = z.object({
    name: z.string().trim().min(1, "Tên nhà cung cấp là bắt buộc"),
    phone: z
        .string()
        .trim()
        .regex(/^[0-9]{9,11}$/, "Số điện thoại không hợp lệ"),
    email: z.string().trim().email("Email không hợp lệ").optional(),
    address: z.string().trim().optional(),
});
// ── Goods Receipt ─────────────────────────────────────────────────────────────
export const GoodsReceiptItemSchema = z.object({
    variantId: z.string().min(1, "variantId là bắt buộc"),
    quantity: z.number().int().positive("Số lượng phải lớn hơn 0"),
    importPrice: z.number().positive("Giá nhập phải lớn hơn 0"),
    batchCode: z.string().min(1, "Mã lô là bắt buộc"),
    manufactureDate: z.coerce.date({ required_error: "Ngày sản xuất là bắt buộc" }),
    expiryDate: z.coerce.date({ required_error: "Hạn sử dụng là bắt buộc" }),
});
export const CreateGoodsReceiptSchema = z.object({
    supplierId: z.string().min(1, "supplierId là bắt buộc"),
    items: z
        .array(GoodsReceiptItemSchema)
        .min(1, "Đơn nhập hàng phải có ít nhất một sản phẩm"),
});
// ── Stock Adjustment ──────────────────────────────────────────────────────────
export const AdjustStockSchema = z.object({
    variantId: z.string().min(1, "variantId là bắt buộc"),
    actualStock: z.number().int().min(0, "Tồn kho thực tế không được âm"),
    minStock: z.number().int().min(0, "Hạn mức tối thiểu không được âm"),
    reason: z.string().trim().optional(),
});
// ── Update Min Stock ──────────────────────────────────────────────────────────
export const UpdateMinStockSchema = z.object({
    variantId: z.string().min(1, "variantId là bắt buộc"),
    minStock: z.number().int().min(0, "Hạn mức tối thiểu không được âm"),
});
