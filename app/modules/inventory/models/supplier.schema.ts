import mongoose, { Document, Schema } from "mongoose";

export interface ISupplier {
  name: string;
  phone: string;
  email: string;
  address: string;
  taxCode?: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  contactPosition?: string;
  isActive: boolean;
  notes?: string;
}

export type SupplierDocument = Document & ISupplier;

const supplierSchema = new Schema<SupplierDocument>(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    taxCode: { type: String, trim: true, default: "" },
    contactPerson: { type: String, trim: true, default: "" },
    contactPhone: { type: String, trim: true, default: "" },
    contactEmail: { type: String, trim: true, default: "" },
    contactPosition: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true },
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true, collection: "suppliers", versionKey: false },
);

const Supplier = mongoose.model<SupplierDocument>("Supplier", supplierSchema);

export default Supplier;
