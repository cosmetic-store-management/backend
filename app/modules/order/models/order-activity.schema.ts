import mongoose, { Document, Schema, Types } from "mongoose";

export interface IOrderActivity {
  orderId: Types.ObjectId;
  action: string;             // e.g. "placed", "status_changed", "payment_received", "shipped", "delivered", "returned", "cancelled", "note_added"
  statusFrom?: string;
  statusTo?: string;
  note?: string;              // e.g. "Refunded 7.044.000 đ. Reason: Defective item"
  operatorId?: Types.ObjectId;
  operatorName: string;       // "Admin", "Staff A", "Customer", "System"
  createdAt: Date;
}

export type OrderActivityDocument = Document & IOrderActivity;

const orderActivitySchema = new Schema<OrderActivityDocument>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    action: { type: String, required: true },
    statusFrom: { type: String },
    statusTo: { type: String },
    note: { type: String },
    operatorId: { type: Schema.Types.ObjectId, ref: "User" },
    operatorName: { type: String, required: true, default: "System" },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: "order_activities",
    versionKey: false,
  }
);

orderActivitySchema.index({ orderId: 1, createdAt: -1 });

const OrderActivity = mongoose.model<OrderActivityDocument>("OrderActivity", orderActivitySchema);
export default OrderActivity;
