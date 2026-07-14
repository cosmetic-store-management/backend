import { injectable, inject } from "tsyringe";
import { TransactionRepository } from "./transaction.repository.js";

@injectable()
export class TransactionService {
  constructor(
    @inject(TransactionRepository) private readonly transactionRepo: TransactionRepository
  ) {}

  logTransaction = async (data: any) => {
    return this.transactionRepo.createTransaction(data);
  };

  updateTransactionStatus = async (
    providerTransactionId: string,
    status: string,
    metaData?: any,
  ) => {
    return this.transactionRepo.findOneAndUpdate(
      { providerTransactionId },
      { status, ...(metaData ? { metaData } : {}) },
      { returnDocument: "after" }
    );
  };

  getTransactionsByOrderId = async (orderId: string) => {
    return this.transactionRepo.findTransactionsByOrderId(orderId);
  };
}
