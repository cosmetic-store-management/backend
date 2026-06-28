import mongoose, { Document, Schema } from "mongoose";

export interface IFlashSaleItem {
  productId: mongoose.Types.ObjectId;
  variantId: mongoose.Types.ObjectId;
  flashPrice: number;
  quantityLimit: number;
  soldQuantity: number;
}

export interface IFlashSale extends Document {
  name: string;
  startTime: Date;
  endTime: Date;
  isActive: boolean;
  items: IFlashSaleItem[];
  createdAt: Date;
  updatedAt: Date;
}

const flashSaleItemSchema = new Schema<IFlashSaleItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: Schema.Types.ObjectId, ref: "Variant", required: true },
    flashPrice: { type: Number, required: true },
    quantityLimit: { type: Number, required: true, min: 1 },
    soldQuantity: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const flashSaleSchema = new Schema<IFlashSale>(
  {
    name: { type: String, required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    items: [flashSaleItemSchema],
  },
  { timestamps: true },
);

flashSaleSchema.index({ startTime: 1, endTime: 1, isActive: 1 });

const FlashSale = mongoose.model<IFlashSale>("FlashSale", flashSaleSchema);
export default FlashSale;
