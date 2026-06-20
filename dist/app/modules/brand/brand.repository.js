import Brand from "../../models/brand.schema.js";
export const findAll = (query, skip, limit) => Brand.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
export const countAll = (query) => Brand.countDocuments(query);
export const findById = (id) => Brand.findById(id);
export const findBySlug = (slug) => Brand.findOne({ slug });
export const findOneBy = (query) => Brand.findOne(query);
export const create = (data) => Brand.create(data);
export const save = (brand) => brand.save();
export const deleteById = (id) => Brand.findByIdAndDelete(id);
