import mongoose, { Document, Schema } from "mongoose";

export interface IAttribute {
  name: string;
  code: string;
  values: string[];
}

export type AttributeDocument = Document & IAttribute;

const attributeSchema = new Schema<AttributeDocument>(
  {
    name:   { type: String, required: true, trim: true },
    code:   { type: String, required: true, unique: true, trim: true, lowercase: true },
    values: { type: [String], default: [] },
  },
  { timestamps: true, collection: "attributes", versionKey: false }
);

const Attribute = mongoose.model<AttributeDocument>("Attribute", attributeSchema);

export default Attribute;
