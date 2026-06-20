import mongoose, { Schema } from "mongoose";
const pointHistorySchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    pointsChanged: { type: Number, required: true },
    reason: { type: String, required: true },
    performedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true, collection: "point_histories" });
pointHistorySchema.index({ userId: 1, createdAt: -1 });
const PointHistory = mongoose.model("PointHistory", pointHistorySchema);
export default PointHistory;
