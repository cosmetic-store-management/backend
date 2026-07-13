import mongoose, { Document, Schema } from "mongoose";

export interface IPointHistory {
  userId: mongoose.Types.ObjectId;
  pointsChanged: number; // positive or negative
  reason: string;
  performedBy: mongoose.Types.ObjectId; // User ID (staff/manager) who did this
}

export type PointHistoryDocument = Document & IPointHistory;

const pointHistorySchema = new Schema<PointHistoryDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    pointsChanged: { type: Number, required: true },
    reason: { type: String, required: true },
    performedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true, collection: "point_histories" },
);

pointHistorySchema.index({ userId: 1, createdAt: -1 });

const PointHistory = mongoose.model<PointHistoryDocument>(
  "PointHistory",
  pointHistorySchema,
);

export default PointHistory;
