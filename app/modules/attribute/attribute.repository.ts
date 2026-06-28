import Attribute, {
  type AttributeDocument,
  type IAttribute,
} from "../../models/product/attribute.schema.js";

type Query = Record<string, any>;

export const findAll = (query: Query, skip: number, limit: number) =>
  Attribute.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);

export const countAll = (query: Query) => Attribute.countDocuments(query);

export const findById = (id: string) => Attribute.findById(id);

export const findByCode = (code: string) => Attribute.findOne({ code });

export const findOneBy = (query: Query) => Attribute.findOne(query);

export const create = (data: Partial<IAttribute>) => Attribute.create(data);

export const save = (attr: AttributeDocument) => attr.save();

export const deleteById = (id: string) => Attribute.findByIdAndDelete(id);
