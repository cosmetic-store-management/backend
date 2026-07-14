import { Request, Response } from "express";
import { injectable, inject } from "tsyringe";
import { TransactionService } from "./transaction.service.js";
import { catchAsync } from "../../../../shared/helpers/catchAsync.js";
import * as response from "../../../../shared/helpers/response.js";

@injectable()
export class TransactionController {
  constructor(
    @inject(TransactionService) private readonly transactionService: TransactionService
  ) {}

  getOrderOrderId = catchAsync(async (req: Request, res: Response) => {
    const transactions = await this.transactionService.getTransactionsByOrderId(
      req.params.orderId as string,
    );
    return response.success(res, { transactions });
  });
}