import mongoose, { Document, Schema, Types } from "mongoose";

export interface IStocktakeItem {
  productId: Types.ObjectId;
  variantId: Types.ObjectId;
  productName: string;
  variantName: string;
  systemQty: number;
  actualQty: number;
  variance: number;
}

export interface IStocktake {
  code: string;
  items: IStocktakeItem[];
  totalVarianceQty: number;
  totalAdjustmentValue: number;
  creatorId: Types.ObjectId;
  notes?: string;
}

export type StocktakeDocument = Document & IStocktake;

const stocktakeItemSchema = new Schema<IStocktakeItem>({
  productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
  variantId: { type: Schema.Types.ObjectId, ref: "Variant", required: true },
  productName: { type: String, required: true, trim: true },
  variantName: { type: String, required: true, trim: true },
  systemQty: { type: Number, required: true },
  actualQty: { type: Number, required: true },
  variance: { type: Number, required: true },
});

const stocktakeSchema = new Schema<StocktakeDocument>(
  {
    code: { type: String, required: true, unique: true, trim: true },
    items: [stocktakeItemSchema],
    totalVarianceQty: { type: Number, required: true },
    totalAdjustmentValue: { type: Number, required: true },
    creatorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    notes: { type: String, trim: true },
  },
  { timestamps: true, collection: "stocktakes", versionKey: false },
);

stocktakeSchema.index({ creatorId: 1 });

const Stocktake = mongoose.model<StocktakeDocument>(
  "Stocktake",
  stocktakeSchema,
);

export default Stocktake;
