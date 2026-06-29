import Category, {
  type CategoryDocument,
  type ICategory,
} from "./models/category.schema.js";
import Product from "../product/models/product.schema.js";
import mongoose from "mongoose";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = Record<string, any>;

export const findAll = async (query: Query, cursor: string | null, limit: number) => {
  if (cursor) query._id = { $lt: cursor };
  const categories = await Category.find(query)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean();
    
  const hasNextPage = categories.length > limit;
  const items = hasNextPage ? categories.slice(0, limit) : categories;
  const nextCursor = hasNextPage ? items[items.length - 1]._id.toString() : null;

  return { categories: items, nextCursor, hasNextPage, limit };
};

export const countAll = (query: Query) => Category.countDocuments(query);

export const findById = (id: string) => Category.findById(id);

export const findBySlug = (slug: string) => Category.findOne({ slug });

export const findOneBy = (query: Query) => Category.findOne(query);

export const create = (data: Partial<ICategory>) => Category.create(data);

export const save = (category: CategoryDocument) => category.save();

export const deleteById = (id: string) => Category.findByIdAndDelete(id);

export const findActiveCategoryIds = (): Promise<mongoose.Types.ObjectId[]> =>
  Product.distinct("categoryId", { isActive: true });

export const findActiveByIds = (ids: mongoose.Types.ObjectId[]) =>
  Category.find({ _id: { $in: ids }, isActive: true })
    .sort({ sortOrder: 1, createdAt: -1 })
    .lean();

export const hasProducts = (categoryId: string) =>
  Product.findOne({ categoryId }).lean();

export const countProductsByCategoryIds = async (
  categoryIds: mongoose.Types.ObjectId[],
) => {
  const counts = await Product.aggregate([
    { $match: { categoryId: { $in: categoryIds } } },
    { $group: { _id: "$categoryId", count: { $sum: 1 } } },
  ]);
  const map = new Map<string, number>();
  counts.forEach((c) => map.set(c._id.toString(), c.count));
  return map;
};
