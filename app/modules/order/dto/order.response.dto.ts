import type { OrderDocument } from "../../../models/order/order.schema.js";

export interface OrderItemResponse {
  productId: string;
  variantId?: string;
  productName: string;
  variantName?: string;
  imageUrl: string;
  price: number;
  quantity: number;
}

export interface OrderResponse {
  id: string;
  code: string;
  receiverName: string;
  phone: string;
  province: string;
  district: string;
  ward: string;
  street: string;
  createdAt: Date | undefined;
  orderStatus: string;
  paymentMethod: string;
  items: OrderItemResponse[];
  subtotal: number;
  shippingFee: number;
  voucherCode?: string;
  discountAmount?: number;
  totalAmount: number;
  note?: string;
  userId: string | null;
  channel: string;
  creatorId: string | null;
  paymentStatus: string;
  transactionId?: string;
}

export const mapOrderItem = (item: any): OrderItemResponse => ({
  productId: item.productId.toString(),
  ...(item.variantId ? { variantId: item.variantId.toString() } : {}),
  productName: item.productName,
  ...(item.variantName ? { variantName: item.variantName } : {}),
  imageUrl: item.imageUrl,
  price: item.price,
  quantity: item.quantity,
});

export const mapOrder = (
  order: OrderDocument,
  items: any[] = [],
): OrderResponse => ({
  id: order._id.toString(),
  code: order.code,
  receiverName: order.receiverName,
  phone: order.phone,
  province: order.province,
  district: order.district,
  ward: order.ward,
  street: order.street,
  createdAt: (order as any).createdAt,
  orderStatus: order.orderStatus,
  paymentMethod: order.paymentMethod,
  items: items.map(mapOrderItem),
  subtotal: order.subtotal,
  shippingFee: order.shippingFee,
  ...(order.voucherCode
    ? { voucherCode: order.voucherCode, discountAmount: order.discountAmount }
    : {}),
  totalAmount: order.totalAmount,
  ...(order.note ? { note: order.note } : {}),
  userId: order.userId?.toString() ?? null,
  channel: order.channel,
  creatorId: order.creatorId?.toString() ?? null,
  paymentStatus: order.paymentStatus,
  ...(order.transactionId ? { transactionId: order.transactionId } : {}),
});
