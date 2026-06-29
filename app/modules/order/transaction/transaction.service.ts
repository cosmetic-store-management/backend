import PaymentTransaction from "../models/payment-transaction.schema.js";

export const createTransaction = async (data: any) => {
  return PaymentTransaction.create(data);
};

export const updateTransactionStatus = async (
  providerTransactionId: string,
  status: string,
  metaData?: any,
) => {
  return PaymentTransaction.findOneAndUpdate(
    { providerTransactionId },
    { status, ...(metaData ? { metaData } : {}) },
    { returnDocument: "after" },
  );
};

export const getTransactionsByOrderId = async (orderId: string) => {
  return PaymentTransaction.find({ orderId }).sort({ createdAt: -1 });
};
