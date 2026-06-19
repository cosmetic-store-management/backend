import type { AttributeDocument } from "../../../models/attribute.schema.js";

export interface AttributeResponse {
  id: string;
  name: string;
  code: string;
  values: string[];
}

export const mapAttribute = (attr: AttributeDocument): AttributeResponse => ({
  id:     attr._id.toString(),
  name:   attr.name,
  code:   attr.code,
  values: attr.values,
});
