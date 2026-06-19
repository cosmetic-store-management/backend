import mongoose, { Document, Schema, Types } from "mongoose";

export interface IInventoryTransaction {
  code: string;
  productId: Types.ObjectId;
  variantId: Types.ObjectId;
  type: "in" | "out" | "adjustment";
  qty: number;
  creatorId: Types.ObjectId;
  date: Date;
}

export type InventoryTransactionDocument = Document & IInventoryTransaction;

const inventoryTransactionSchema = new Schema<InventoryTransactionDocument>(
  {
    code:      { type: String, required: true, unique: true, trim: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: Schema.Types.ObjectId, ref: "Variant", required: true },
    type:      { type: String, enum: ["in", "out", "adjustment"], required: true },
    qty:       { type: Number, required: true },
    creatorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    date:      { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "inventory_transactions", versionKey: false }
);

inventoryTransactionSchema.index({ productId: 1, variantId: 1 });
inventoryTransactionSchema.index({ date: -1 });

const InventoryTransaction = mongoose.model<InventoryTransactionDocument>("InventoryTransaction", inventoryTransactionSchema);

export default InventoryTransaction;
