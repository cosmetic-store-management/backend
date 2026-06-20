import Category from "../../models/category.schema.js";
import Product from "../../models/product.schema.js";
export const findAll = (query, skip, limit) => Category.find(query).sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(limit).lean();
export const countAll = (query) => Category.countDocuments(query);
export const findById = (id) => Category.findById(id);
export const findBySlug = (slug) => Category.findOne({ slug });
export const findOneBy = (query) => Category.findOne(query);
export const create = (data) => Category.create(data);
export const save = (category) => category.save();
export const deleteById = (id) => Category.findByIdAndDelete(id);
export const findActiveCategoryIds = () => Product.distinct("categoryId", { isActive: true });
export const findActiveByIds = (ids) => Category.find({ _id: { $in: ids }, isActive: true }).sort({ sortOrder: 1, createdAt: -1 }).lean();
export const hasProducts = (categoryId) => Product.findOne({ categoryId }).lean();
export const countProductsByCategoryIds = async (categoryIds) => {
    const counts = await Product.aggregate([
        { $match: { categoryId: { $in: categoryIds } } },
        { $group: { _id: "$categoryId", count: { $sum: 1 } } }
    ]);
    const map = new Map();
    counts.forEach((c) => map.set(c._id.toString(), c.count));
    return map;
};
