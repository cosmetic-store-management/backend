import Product, {
  type ProductDocument,
  type IProduct,
} from "./models/product.schema.js";
import Variant from "./models/variant.schema.js";
import Category from "../category/models/category.schema.js";
import mongoose from "mongoose";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = Record<string, any>;

const CATEGORY_FIELDS = "name slug imageUrl isActive";
const BRAND_FIELDS = "name slug imageUrl country isActive";

export function attachVariants(
  products: ProductDocument[],
): Promise<ProductDocument[]>;
export function attachVariants(
  products: ProductDocument,
): Promise<ProductDocument>;
export async function attachVariants(
  products: ProductDocument | ProductDocument[],
): Promise<ProductDocument | ProductDocument[]> {
  if (Array.isArray(products)) {
    if (products.length === 0) return products;
    const ids = products.map((p) => p._id);
    const variants = await Variant.find({ productId: { $in: ids } }).lean();
    for (const p of products) {
      (p as any).variants = variants.filter(
        (v) => v.productId.toString() === p._id.toString(),
      );
    }
    return products;
  } else if (products) {
    const variants = await Variant.find({ productId: products._id }).lean();
    (products as any).variants = variants;
    return products;
  }
  return products;
}

export const findPublic = async (
  query: Query,
  skip: number,
  limit: number,
  sortOrder?: Record<string, any>,
) => {
  // Optimize pagination using Late Row Lookup (Deferred Join)
  const productIds = await Product.find(query)
    .select("_id")
    .sort(sortOrder ?? { createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  return findPublicByIds(productIds.map((p: any) => p._id));
};

/** Fetch products by specific IDs, preserving the supplied order (for price-sorted results) */
export const findPublicByIds = async (
  ids: mongoose.Types.ObjectId[],
): Promise<ProductDocument[]> => {
  if (ids.length === 0) return [];
  const products = await Product.find({ _id: { $in: ids } })
    .populate("categoryId", CATEGORY_FIELDS)
    .populate("categoryIds", CATEGORY_FIELDS)
    .populate("brandId", BRAND_FIELDS)
    .lean();
  // Re-sort to maintain aggregate order
  const productMap = new Map(products.map((p) => [p._id.toString(), p]));
  const sorted = ids
    .map((id) => productMap.get(id.toString()))
    .filter(Boolean) as ProductDocument[];
  return attachVariants(sorted);
};

export const findAdmin = async (query: Query, cursor: string | null, limit: number, page?: number) => {
  let dbQuery = Product.find(query);

  if (page && page > 0) {
    const skip = (page - 1) * limit;
    dbQuery = dbQuery.skip(skip).sort({ _id: -1 });
  } else if (cursor) {
    query._id = { $lt: cursor };
    dbQuery = Product.find(query).sort({ _id: -1 });
  } else {
    dbQuery = dbQuery.sort({ _id: -1 });
  }

  const products = await dbQuery
    .populate("categoryId", "name slug imageUrl")
    .populate("categoryIds", "name slug imageUrl")
    .populate("brandId", BRAND_FIELDS)
    .limit(limit + 1)
    .lean();
  
  const hasNextPage = products.length > limit;
  const items = hasNextPage ? products.slice(0, limit) : products;
  const nextCursor = hasNextPage ? items[items.length - 1]._id.toString() : null;

  return { products: await attachVariants(items), nextCursor, hasNextPage, limit };
};

export const countAll = (query: Query) => Product.countDocuments(query);

/** Returns brand summaries available in the given product set — grouped by brandId (source of truth) */
export const findBrandsInProducts = async (query: Query) => {
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

export const findCategoriesInProducts = async (query: Query) => {
  const result = await Product.aggregate([
    { $match: query },
    { $group: { _id: "$categoryId" } },
    { $match: { _id: { $ne: null } } },
    { $project: { categoryId: "$_id", _id: 0 } },
  ]);
  return result.map((r) => r.categoryId.toString());
};

export const findById = async (id: string) => {
  const product = await Product.findById(id)
    .populate("categoryId", "name slug imageUrl")
    .populate("categoryIds", "name slug imageUrl")
    .populate("brandId", BRAND_FIELDS)
    .lean();
  return product ? attachVariants(product) : null;
};

export const findBySlug = async (slug: string) => {
  const product = await Product.findOne({ slug, isActive: true })
    .populate("categoryId", CATEGORY_FIELDS)
    .populate("categoryIds", CATEGORY_FIELDS)
    .populate("brandId", BRAND_FIELDS)
    .lean();
  return product ? attachVariants(product) : null;
};

export const findOneBy = (query: Query) => Product.findOne(query).lean();

export const findDocumentBy = (query: Query) => Product.findOne(query);

export const findDocumentById = (id: string) => Product.findById(id);

export const create = (data: Partial<IProduct>) => Product.create(data);

export const save = (product: ProductDocument) => product.save();

export const findByIdAndDelete = async (id: string) => {
  await Variant.deleteMany({ productId: id });
  return Product.findByIdAndDelete(id);
};

export const updateById = (id: string, update: Partial<IProduct>) =>
  Product.findByIdAndUpdate(id, update, { returnDocument: "after" }).lean();

export const findActiveCategories = () =>
  Category.find({ isActive: true }).select("_id").lean();

export const findCategoryById = (id: string) => Category.findById(id).lean();

export const findCategoryBySlug = (slug: string) =>
  Category.findOne({ slug, isActive: true }).select("_id").lean();

export const findCategoryIdsWithDescendants = async (slug: string) => {
  const root = await Category.findOne({ slug, isActive: true })
    .select("_id")
    .lean();
  if (!root) return [];

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
