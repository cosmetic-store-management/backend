import { injectable } from "tsyringe";
import Category, { type CategoryDocument, type ICategory } from "./models/category.schema.js";
import Product from "../product/models/product.schema.js";
import mongoose from "mongoose";

type Query = Record<string, any>;

@injectable()
export class CategoryRepository {
  async findAll(query: Query, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [categories, total] = await Promise.all([
      Category.find(query).sort({ _id: -1 }).skip(skip).limit(limit).lean(),
      Category.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);
    return { categories, total, limit, page, totalPages };
  }

  countAll(query: Query) {
    return Category.countDocuments(query);
  }

  findById(id: string) {
    return Category.findById(id);
  }

  findBySlug(slug: string) {
    return Category.findOne({ slug });
  }

  findOneBy(query: Query) {
    return Category.findOne(query);
  }

  create(data: Partial<ICategory>) {
    return Category.create(data);
  }

  save(category: CategoryDocument) {
    return category.save();
  }

  deleteById(id: string) {
    return Category.findByIdAndDelete(id);
  }

  findActiveCategoryIds(): Promise<mongoose.Types.ObjectId[]> {
    return Product.distinct("categoryId", { isActive: true });
  }

  async findMaxSortOrder(parentId: mongoose.Types.ObjectId | null): Promise<number> {
    const result = await Category.findOne({ parentId }).sort({ sortOrder: -1 }).select("sortOrder").lean();
    return result ? result.sortOrder : 0;
  }

  findActiveByIds(ids: mongoose.Types.ObjectId[]) {
    return Category.find({ _id: { $in: ids }, isActive: true }).sort({ sortOrder: 1, createdAt: -1 }).lean();
  }

  hasProducts(categoryId: string) {
    return Product.findOne({ categoryId }).lean();
  }

  async countProductsByCategoryIds(categoryIds: mongoose.Types.ObjectId[]) {
    const counts = await Product.aggregate([
      { $match: { categoryId: { $in: categoryIds } } },
      { $group: { _id: "$categoryId", count: { $sum: 1 } } },
    ]);
    const map = new Map<string, number>();
    counts.forEach((c) => map.set(c._id.toString(), c.count));
    return map;
  }
}
