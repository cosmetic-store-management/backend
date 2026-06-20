import Attribute from "../../models/attribute.schema.js";
export const findAll = (query, skip, limit) => Attribute.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
export const countAll = (query) => Attribute.countDocuments(query);
export const findById = (id) => Attribute.findById(id);
export const findByCode = (code) => Attribute.findOne({ code });
export const findOneBy = (query) => Attribute.findOne(query);
export const create = (data) => Attribute.create(data);
export const save = (attr) => attr.save();
export const deleteById = (id) => Attribute.findByIdAndDelete(id);
