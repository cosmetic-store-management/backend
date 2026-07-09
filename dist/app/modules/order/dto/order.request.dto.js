import { z } from "zod";
const OrderItemInputSchema = z.object({
    productId: z.string().min(1, "productId không được để trống"),
    variantId: z.string().min(1, "variantId không được để trống"),
    quantity: z.number().int().min(1, "Số lượng phải là số nguyên dương"),
});
export const CreateOrderSchema = z.object({
    paymentMethod: z.enum(["cod", "stripe", "cash", "pos_card", "transfer", "bank"], "Phương thức thanh toán không hợp lệ"),
    items: z
        .array(OrderItemInputSchema)
        .min(1, "Đơn hàng phải có ít nhất một sản phẩm"),
    note: z.string().trim().optional().default(""),
    receiverName: z.string().min(1, "Họ tên người nhận không được để trống"),
    phone: z.string().min(1, "Số điện thoại nhận hàng không được để trống"),
    province: z.string().min(1, "Province/City cannot be empty"),
    district: z.string().min(1, "District cannot be empty"),
    ward: z.string().min(1, "Ward cannot be empty"),
    street: z.string().min(1, "Số nhà, tên đường không được để trống"),
    shippingMethod: z.enum(["standard", "express"]).default("standard"),
    voucherCode: z.string().trim().optional(),
    usedPoints: z.number().int().min(0).optional().default(0),
    idempotencyKey: z.string().trim().optional(), // Ngăn chặn double submit
});
export const PreviewOrderSchema = z.object({
    items: z.array(OrderItemInputSchema).min(1, "Cart is empty"),
    voucherCode: z.string().trim().optional(),
    usedPoints: z.number().int().min(0).optional().default(0),
    discountAmount: z.number().int().min(0).optional().default(0), // Manual POS discount
    customerPhone: z.string().trim().optional(), // Dành cho POS
    channel: z.enum(["online", "pos"]).default("online"),
    province: z.string().trim().optional(), // Để tính phí ship (tuỳ chọn)
});
export const UpdateOrderStatusSchema = z.object({
    orderStatus: z.enum(["pending", "processing", "shipping", "completed", "cancelled", "returned"], "Trạng thái đơn hàng không hợp lệ"),
    trackingCode: z.string().trim().optional(), // Mã vận đơn (giao hàng)
});
export const UpdateOrderDetailsSchema = z.object({
    receiverName: z.string().min(1, "Họ tên không được để trống").optional(),
    phone: z.string().min(1, "SĐT không được để trống").optional(),
    province: z.string().min(1, "Province/City cannot be empty").optional(),
    district: z.string().min(1, "District cannot be empty").optional(),
    ward: z.string().min(1, "Ward cannot be empty").optional(),
    street: z.string().min(1, "Số nhà không được để trống").optional(),
    note: z.string().optional(),
});
