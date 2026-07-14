import { injectable } from "tsyringe";
import PaymentTransaction, { PaymentTransactionDocument } from "../models/payment-transaction.schema.js";
import mongoose from "mongoose";

@injectable()
export class TransactionRepository {
  createTransaction(data: any, session?: mongoose.ClientSession): Promise<PaymentTransactionDocument> {
    const doc = new PaymentTransaction(data);
    return doc.save({ session });
  }

  async createTransactions(data: any[], session?: mongoose.ClientSession): Promise<PaymentTransactionDocument[]> {
    return PaymentTransaction.insertMany(data, { session });
  }

  findTransactionsByOrderId(orderId: mongoose.Types.ObjectId | string): Promise<PaymentTransactionDocument[]> {
    return PaymentTransaction.find({ orderId }).sort({ createdAt: -1 });
  }

  findOneAndUpdate(query: Record<string, any>, update: Record<string, any>, options?: any): Promise<PaymentTransactionDocument | null> {
    return PaymentTransaction.findOneAndUpdate(query, update, options).lean();
  }

  findOne(query: Record<string, any>): Promise<PaymentTransactionDocument | null> {
    return PaymentTransaction.findOne(query).lean();
  }
}
