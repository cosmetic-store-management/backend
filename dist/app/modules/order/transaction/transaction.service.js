import PaymentTransaction from "../models/payment-transaction.schema.js";
export const createTransaction = async (data) => {
    return PaymentTransaction.create(data);
};
export const updateTransactionStatus = async (providerTransactionId, status, metaData) => {
    return PaymentTransaction.findOneAndUpdate({ providerTransactionId }, { status, ...(metaData ? { metaData } : {}) }, { returnDocument: "after" });
};
export const getTransactionsByOrderId = async (orderId) => {
    return PaymentTransaction.find({ orderId }).sort({ createdAt: -1 });
};
