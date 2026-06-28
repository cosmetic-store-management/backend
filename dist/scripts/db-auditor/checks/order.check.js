import Order from "../../../app/models/order/order.schema.js";
const OrderCheck = {
    name: "Order Logic & Payment Check",
    description: "Kiểm tra tính nhất quán dữ liệu của đơn hàng (thanh toán, tổng tiền)",
    async run() {
        const issues = [];
        // 1. Check for orders that are 'paid' via online methods but missing transactionId
        const missingTxOrders = await Order.find({
            paymentStatus: "paid",
            paymentMethod: { $in: ["stripe", "transfer", "bank"] },
            $or: [
                { transactionId: { $exists: false } },
                { transactionId: "" },
                { transactionId: null }
            ]
        }).lean();
        for (const order of missingTxOrders) {
            issues.push({
                message: `Đơn hàng ${order.code} đã thanh toán (paid) qua ${order.paymentMethod} nhưng thiếu transactionId.`,
                severity: "error",
                data: { orderId: order._id, code: order.code, method: order.paymentMethod }
            });
        }
        // 2. Check total amount calculation consistency
        const allOrders = await Order.find({ orderStatus: { $ne: "cancelled" } }).lean();
        for (const order of allOrders) {
            const expectedTotal = order.subtotal + order.shippingFee - order.discountAmount - order.tierDiscountAmount;
            // We allow a small float point margin (e.g. 1 unit)
            if (Math.abs(order.totalAmount - expectedTotal) > 1) {
                issues.push({
                    message: `Đơn hàng ${order.code} có tổng tiền (${order.totalAmount}) không khớp với công thức tính toán (${expectedTotal}).`,
                    severity: "error",
                    data: {
                        orderId: order._id,
                        code: order.code,
                        total: order.totalAmount,
                        expected: expectedTotal,
                        subtotal: order.subtotal,
                        shipping: order.shippingFee,
                        discount: order.discountAmount,
                        tierDiscount: order.tierDiscountAmount
                    }
                });
            }
        }
        return issues;
    }
};
export default OrderCheck;
