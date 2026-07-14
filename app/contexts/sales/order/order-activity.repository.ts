import { injectable } from "tsyringe";
import mongoose from "mongoose";
import OrderActivity from "./models/order-activity.schema.js";

@injectable()
export class OrderActivityRepository {
  async logActivity(data: any, session?: mongoose.ClientSession) {
    return OrderActivity.create([data], { session });
  }

  async getOrderActivities(orderId: string | mongoose.Types.ObjectId) {
    return OrderActivity.find({ orderId }).sort({ createdAt: -1 }).lean();
  }
}
