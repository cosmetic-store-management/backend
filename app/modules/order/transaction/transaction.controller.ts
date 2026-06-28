import { Router, Request, Response } from "express";
import * as transactionService from "./transaction.service.js";
import { authenticate } from "../../../middlewares/auth.middleware.js";
import { catchAsync } from "../../../shared/helpers/catchAsync.js";
import * as response from "../../../shared/helpers/response.js";

const router = Router();

router.get(
  "/order/:orderId",
  authenticate,
  catchAsync(async (req: Request, res: Response) => {
    const transactions = await transactionService.getTransactionsByOrderId(
      req.params.orderId as string,
    );
    return response.success(res, { transactions });
  }),
);

export default router;
