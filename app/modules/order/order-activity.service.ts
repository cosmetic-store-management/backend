import mongoose from "mongoose";
import OrderActivity from "./models/order-activity.schema.js";

export const logOrderActivity = async (
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
    operatorName: data.operatorName || "System",
  };

  if (session) {
    return await OrderActivity.create([activityData], { session });
  } else {
    return await OrderActivity.create(activityData);
  }
};

export const getOrderActivities = async (orderId: string) => {
  return await OrderActivity.find({ orderId: new mongoose.Types.ObjectId(orderId) })
    .sort({ createdAt: -1 })
    .exec();
};
