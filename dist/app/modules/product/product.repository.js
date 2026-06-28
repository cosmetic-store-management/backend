import Product from "../../models/product/product.schema.js";
import Variant from "../../models/product/variant.schema.js";
import Category from "../../models/product/category.schema.js";
const CATEGORY_FIELDS = "name slug imageUrl isActive";
const BRAND_FIELDS = "name slug imageUrl country isActive";
export async function attachVariants(products) {
    if (Array.isArray(products)) {
        if (products.length === 0)
            return products;
        const ids = products.map((p) => p._id);
        const variants = await Variant.find({ productId: { $in: ids } }).lean();
        for (const p of products) {
            p.variants = variants.filter((v) => v.productId.toString() === p._id.toString());
        }
        return products;
    }
    else if (products) {
        const variants = await Variant.find({ productId: products._id }).lean();
        products.variants = variants;
        return products;
    }
    return products;
}
export const findPublic = async (query, skip, limit, sortOrder) => {
    // Optimize pagination using Late Row Lookup (Deferred Join)
    const productIds = await Product.find(query)
        .select("_id")
        .sort(sortOrder ?? { createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
    return findPublicByIds(productIds.map((p) => p._id));
};
/** Fetch products by specific IDs, preserving the supplied order (for price-sorted results) */
export const findPublicByIds = async (ids) => {
    if (ids.length === 0)
        return [];
    const products = await Product.find({ _id: { $in: ids } })
        .populate("categoryId", CATEGORY_FIELDS)
        .populate("categoryIds", CATEGORY_FIELDS)
        .populate("brandId", BRAND_FIELDS)
        .lean();
    // Re-sort to maintain aggregate order
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));
    const sorted = ids
        .map((id) => productMap.get(id.toString()))
        .filter(Boolean);
    return attachVariants(sorted);
};
export const findAdmin = async (query, cursor, limit) => {
    if (cursor) {
        query._id = { $lt: cursor };
    }
    const products = await Product.find(query)
        .populate("categoryId", "name slug imageUrl")
        .populate("categoryIds", "name slug imageUrl")
        .populate("brandId", BRAND_FIELDS)
        .sort({ _id: -1 })
        .limit(limit + 1)
        .lean();
    const hasNextPage = products.length > limit;
    const items = hasNextPage ? products.slice(0, limit) : products;
    const nextCursor = hasNextPage ? items[items.length - 1]._id.toString() : null;
    return { products: await attachVariants(items), nextCursor, hasNextPage, limit };
};
export const countAll = (query) => Product.countDocuments(query);
/** Returns brand summaries available in the given product set — grouped by brandId (source of truth) */
export const findBrandsInProducts = async (query) => {
    return Product.aggregate([
        { $match: query },
        { $match: { brandId: { $exists: true, $ne: null } } },
        { $group: { _id: "$brandId" } },
        {
            $lookup: {
                from: "brands",
                localField: "_id",
                foreignField: "_id",
                as: "brand",
            },
        },
        { $unwind: { path: "$brand", preserveNullAndEmptyArrays: false } },
        { $match: { "brand.isActive": true } },
        {
            $project: {
                _id: 0,
                id: { $toString: "$brand._id" },
                name: "$brand.name",
                slug: "$brand.slug",
                imageUrl: "$brand.imageUrl",
                country: "$brand.country",
            },
        },
        { $sort: { name: 1 } },
    ]);
};
export const findCategoriesInProducts = async (query) => {
    const result = await Product.aggregate([
        { $match: query },
        { $group: { _id: "$categoryId" } },
        { $match: { _id: { $ne: null } } },
        { $project: { categoryId: "$_id", _id: 0 } },
    ]);
    return result.map((r) => r.categoryId.toString());
};
export const findById = async (id) => {
    const product = await Product.findById(id)
        .populate("categoryId", "name slug imageUrl")
        .populate("categoryIds", "name slug imageUrl")
        .populate("brandId", BRAND_FIELDS)
        .lean();
    return product ? attachVariants(product) : null;
};
export const findBySlug = async (slug) => {
    const product = await Product.findOne({ slug, isActive: true })
        .populate("categoryId", CATEGORY_FIELDS)
        .populate("categoryIds", CATEGORY_FIELDS)
        .populate("brandId", BRAND_FIELDS)
        .lean();
    return product ? attachVariants(product) : null;
};
export const findOneBy = (query) => Product.findOne(query).lean();
export const findDocumentBy = (query) => Product.findOne(query);
export const findDocumentById = (id) => Product.findById(id);
export const create = (data) => Product.create(data);
export const save = (product) => product.save();
export const findByIdAndDelete = async (id) => {
    await Variant.deleteMany({ productId: id });
    return Product.findByIdAndDelete(id);
};
export const updateById = (id, update) => Product.findByIdAndUpdate(id, update, { returnDocument: "after" }).lean();
export const findActiveCategories = () => Category.find({ isActive: true }).select("_id").lean();
export const findCategoryById = (id) => Category.findById(id).lean();
export const findCategoryBySlug = (slug) => Category.findOne({ slug, isActive: true }).select("_id").lean();
export const findCategoryIdsWithDescendants = async (slug) => {
    const root = await Category.findOne({ slug, isActive: true })
        .select("_id")
        .lean();
    if (!root)
        return [];
    const resultIds = [root._id];
    let currentIds = [root._id];
    while (currentIds.length > 0) {
        const children = await Category.find({
            parentId: { $in: currentIds },
            isActive: true,
        })
            .select("_id")
            .lean();
        const childIds = children.map((c) => c._id);
        resultIds.push(...childIds);
        currentIds = childIds;
    }
    return resultIds;
};
