import Brand from "./models/brand.schema.js";
export const findAll = async (query, page, limit) => {
    const skip = (page - 1) * limit;
    const [brands, total] = await Promise.all([
        Brand.find(query).sort({ _id: -1 }).skip(skip).limit(limit).lean(),
        Brand.countDocuments(query),
    ]);
    const totalPages = Math.ceil(total / limit);
    return { brands, total, limit, page, totalPages };
};
export const countAll = (query) => Brand.countDocuments(query);
export const findById = (id) => Brand.findById(id);
export const findBySlug = (slug) => Brand.findOne({ slug });
export const findOneBy = (query) => Brand.findOne(query);
export const create = (data) => Brand.create(data);
export const save = (brand) => brand.save();
export const deleteById = (id) => Brand.findByIdAndDelete(id);
