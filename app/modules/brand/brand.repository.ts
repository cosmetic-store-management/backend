import Brand, { type BrandDocument, type IBrand } from "../../models/brand.schema.js";

type Query = Record<string, any>;

export const findAll = (query: Query, skip: number, limit: number) =>
  Brand.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();

export const countAll = (query: Query) =>
  Brand.countDocuments(query);

export const findById = (id: string) =>
  Brand.findById(id);

export const findBySlug = (slug: string) =>
  Brand.findOne({ slug });

export const findOneBy = (query: Query) =>
  Brand.findOne(query);

export const create = (data: Partial<IBrand>) =>
  Brand.create(data);

export const save = (brand: BrandDocument) =>
  brand.save();

export const deleteById = (id: string) =>
  Brand.findByIdAndDelete(id);
