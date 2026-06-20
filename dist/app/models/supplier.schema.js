import mongoose, { Schema } from "mongoose";
const supplierSchema = new Schema({
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
}, { timestamps: true, collection: "suppliers", versionKey: false });
const Supplier = mongoose.model("Supplier", supplierSchema);
export default Supplier;
