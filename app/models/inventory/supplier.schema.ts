import mongoose, { Document, Schema } from "mongoose";

export interface ISupplier {
  name: string;
  phone: string;
  email: string;
  address: string;
}

export type SupplierDocument = Document & ISupplier;

const supplierSchema = new Schema<SupplierDocument>(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
  },
  { timestamps: true, collection: "suppliers", versionKey: false },
);

const Supplier = mongoose.model<SupplierDocument>("Supplier", supplierSchema);

export default Supplier;
