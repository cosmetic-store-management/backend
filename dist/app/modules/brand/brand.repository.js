import Brand from "../../models/product/brand.schema.js";
export const findAll = async (query, cursor, limit) => {
    if (cursor)
        query._id = { $lt: cursor };
    const brands = await Brand.find(query).sort({ _id: -1 }).limit(limit + 1).lean();
    const hasNextPage = brands.length > limit;
    const items = hasNextPage ? brands.slice(0, limit) : brands;
    const nextCursor = hasNextPage ? items[items.length - 1]._id.toString() : null;
    return { brands: items, nextCursor, hasNextPage, limit };
};
export const countAll = (query) => Brand.countDocuments(query);
export const findById = (id) => Brand.findById(id);
export const findBySlug = (slug) => Brand.findOne({ slug });
export const findOneBy = (query) => Brand.findOne(query);
export const create = (data) => Brand.create(data);
export const save = (brand) => brand.save();
export const deleteById = (id) => Brand.findByIdAndDelete(id);
