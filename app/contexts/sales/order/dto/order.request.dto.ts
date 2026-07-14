import { z } from "zod";

const OrderItemInputSchema = z.object({
  productId: z.string().min(1, "productId cannot be empty"),
  variantId: z.string().min(1, "variantId cannot be empty"),
  quantity: z.number().int().min(1, "Quantity must be a positive integer"),
});

export const CreateOrderSchema = z.object({
  paymentMethod: z.enum(
    ["cod", "stripe", "cash", "pos_card", "transfer", "bank"],
    "Invalid payment method",
  ),
  items: z
    .array(OrderItemInputSchema)
    .min(1, "Order must have at least one product"),
  note: z.string().trim().optional().default(""),
  receiverName: z.string().min(1, "Recipient name cannot be empty"),
  phone: z.string().min(1, "Recipient phone number cannot be empty"),
  province: z.string().min(1, "Province/City cannot be empty"),
  district: z.string().min(1, "District cannot be empty"),
  ward: z.string().min(1, "Ward cannot be empty"),
  street: z.string().min(1, "House number, street name cannot be empty"),
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
  orderStatus: z.enum(
    ["pending", "processing", "shipping", "completed", "cancelled", "returned"],
    "Invalid order status",
  ),
  trackingCode: z.string().trim().optional(), // Mã vận đơn (giao hàng)
});

export const UpdateOrderDetailsSchema = z.object({
  receiverName: z.string().min(1, "Name cannot be empty").optional(),
  phone: z.string().min(1, "Phone number cannot be empty").optional(),
  province: z.string().min(1, "Province/City cannot be empty").optional(),
  district: z.string().min(1, "District cannot be empty").optional(),
  ward: z.string().min(1, "Ward cannot be empty").optional(),
  street: z.string().min(1, "House number cannot be empty").optional(),
  note: z.string().optional(),
});

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof UpdateOrderStatusSchema>;
export type OrderItemInput = z.infer<typeof OrderItemInputSchema>;
export type PreviewOrderInput = z.infer<typeof PreviewOrderSchema>;
export type UpdateOrderDetailsInput = z.infer<typeof UpdateOrderDetailsSchema>;
