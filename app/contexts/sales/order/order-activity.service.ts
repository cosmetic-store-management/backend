import { injectable, inject } from "tsyringe";
import mongoose from "mongoose";
import { OrderActivityRepository } from "./order-activity.repository.js";

@injectable()
export class OrderActivityService {
  constructor(
    @inject(OrderActivityRepository) private readonly activityRepo: OrderActivityRepository
  ) {}

  logOrderActivity = async (
    orderId: string | mongoose.Types.ObjectId,
    action: string,
    data: {
      statusFrom?: string;
      statusTo?: string;
      note?: string;
      operatorId?: string | mongoose.Types.ObjectId;
      operatorName?: string;
    },
    session?: mongoose.ClientSession,
  ) => {
    const activityData = {
      orderId: typeof orderId === "string" ? new mongoose.Types.ObjectId(orderId) : orderId,
      action,
      statusFrom: data.statusFrom,
      statusTo: data.statusTo,
      note: data.note,
      operatorId: data.operatorId
        ? typeof data.operatorId === "string"
          ? new mongoose.Types.ObjectId(data.operatorId)
          : data.operatorId
        : undefined,
      operatorName: data.operatorName,
    };

    return this.activityRepo.logActivity(activityData, session);
  };

  getOrderActivities = async (orderId: string | mongoose.Types.ObjectId) => {
    return this.activityRepo.getOrderActivities(orderId);
  };
}
