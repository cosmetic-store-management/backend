import Category, {
  type CategoryDocument,
  type ICategory,
} from "./models/category.schema.js";
import Product from "../product/models/product.schema.js";
import mongoose from "mongoose";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = Record<string, any>;

export const findAll = async (query: Query, page: number, limit: number) => {
  const skip = (page - 1) * limit;
  const [categories, total] = await Promise.all([
    Category.find(query)
      .sort({ _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Category.countDocuments(query),
  ]);

  const totalPages = Math.ceil(total / limit);

  return { categories, total, limit, page, totalPages };
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

export const findMaxSortOrder = async (
  parentId: mongoose.Types.ObjectId | null,
): Promise<number> => {
  const result = await Category.findOne({ parentId })
    .sort({ sortOrder: -1 })
    .select("sortOrder")
    .lean();
  return result ? result.sortOrder : 0;
};

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
