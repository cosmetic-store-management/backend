import { injectable } from "tsyringe";
import Product, {
  type ProductDocument,
  type IProduct,
} from "./models/product.schema.js";
import Variant from "./models/variant.schema.js";
import Category from "../category/models/category.schema.js";
import { SearchKeywordModel } from "./models/search-keyword.schema.js";
import mongoose from "mongoose";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = Record<string, any>;

const CATEGORY_FIELDS = "name slug imageUrl isActive";
const BRAND_FIELDS = "name slug imageUrl country isActive";

@injectable()
export class ProductRepository {
  async attachVariants(products: ProductDocument[]): Promise<ProductDocument[]>;
  async attachVariants(products: ProductDocument): Promise<ProductDocument>;
  async attachVariants(
    products: ProductDocument | ProductDocument[]
  ): Promise<ProductDocument | ProductDocument[]> {
    if (Array.isArray(products)) {
      if (products.length === 0) return products;
      const ids = products.map((p) => p._id);
      const variants = await Variant.find({ productId: { $in: ids } }).lean();
      for (const p of products) {
        (p as any).variants = variants.filter(
          (v) => v.productId.toString() === p._id.toString()
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

  findRaw(query: Query) {
    return Product.find(query);
  }

  findVariantsRaw(query: Query) {
    return Variant.find(query);
  }

  async logSearchKeyword(term: string): Promise<void> {
    const cleanTerm = term.trim().toLowerCase();
    if (!cleanTerm) return;

    try {
      await SearchKeywordModel.findOneAndUpdate(
        { term: cleanTerm },
        {
          $inc: { count: 1 },
          $set: { lastSearchedAt: new Date() },
        },
        { upsert: true, new: true }
      );
    } catch (error) {
      console.error("Failed to log search keyword:", error);
    }
  }

  async getPopularSearches(limit: number = 10): Promise<string[]> {
    try {
      const popular = await SearchKeywordModel.find()
        .sort({ count: -1, lastSearchedAt: -1 })
        .limit(limit)
        .select("term")
        .lean();
      return popular.map((p) => p.term);
    } catch (error) {
      console.error("Failed to fetch popular searches:", error);
      return [];
    }
  }

  async findPublic(
    query: Query,
    skip: number,
    limit: number,
    sortOrder?: Record<string, any>
  ) {
    // Optimize pagination using Late Row Lookup (Deferred Join)
    const productIds = await Product.find(query)
      .select("_id")
      .sort(sortOrder ?? { createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return this.findPublicByIds(productIds.map((p: any) => p._id));
  }

  async findPublicByIds(
    ids: mongoose.Types.ObjectId[]
  ): Promise<ProductDocument[]> {
    if (ids.length === 0) return [];
    const products = await Product.find({ _id: { $in: ids } })
      .select("-description -metaTitle -metaDescription -metaKeywords")
      .populate("categoryId", CATEGORY_FIELDS)
      .populate("categoryIds", CATEGORY_FIELDS)
      .populate("brandId", BRAND_FIELDS)
      .lean();
    // Re-sort to maintain aggregate order
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));
    const sorted = ids
      .map((id) => productMap.get(id.toString()))
      .filter(Boolean) as ProductDocument[];
    return this.attachVariants(sorted);
  }

  async findAdmin(query: Query, cursor: string | null, limit: number, page?: number) {
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
      .select("-description")
      .populate("categoryId", "name slug imageUrl")
      .populate("categoryIds", "name slug imageUrl")
      .populate("brandId", BRAND_FIELDS)
      .limit(limit + 1)
      .lean();
    
    const hasNextPage = products.length > limit;
    const items = hasNextPage ? products.slice(0, limit) : products;
    const nextCursor = hasNextPage ? items[items.length - 1]._id.toString() : null;

    return { products: await this.attachVariants(items), nextCursor, hasNextPage, limit };
  }

  countAll(query: Query) {
    return Product.countDocuments(query);
  }

  async findBrandsInProducts(query: Query) {
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
  }

  async findCategoriesInProducts(query: Query) {
    const result = await Product.aggregate([
      { $match: query },
      { $group: { _id: "$categoryId" } },
      { $match: { _id: { $ne: null } } },
      { $project: { categoryId: "$_id", _id: 0 } },
    ]);
    return result.map((r) => r.categoryId.toString());
  }

  async findById(id: string) {
    const product = await Product.findById(id)
      .populate("categoryId", "name slug imageUrl")
      .populate("categoryIds", "name slug imageUrl")
      .populate("brandId", BRAND_FIELDS)
      .lean();
    return product ? this.attachVariants(product) : null;
  }

  async findBySlug(slug: string) {
    const product = await Product.findOne({ slug, isActive: true })
      .populate("categoryId", CATEGORY_FIELDS)
      .populate("categoryIds", CATEGORY_FIELDS)
      .populate("brandId", BRAND_FIELDS)
      .lean();
    return product ? this.attachVariants(product) : null;
  }

  findOneBy(query: Query) {
    return Product.findOne(query).lean();
  }

  findDocumentBy(query: Query) {
    return Product.findOne(query);
  }

  findDocumentById(id: string) {
    return Product.findById(id);
  }

  create(data: Partial<IProduct>) {
    return Product.create(data);
  }

  save(product: ProductDocument) {
    return product.save();
  }

  async findByIdAndDelete(id: string) {
    await Variant.deleteMany({ productId: id });
    return Product.findByIdAndDelete(id);
  }

  updateById(id: string, update: Partial<IProduct>) {
    return Product.findByIdAndUpdate(id, update, { returnDocument: "after" }).lean();
  }

  findActiveCategories() {
    return Category.find({ isActive: true }).select("_id").lean();
  }

  findCategoryById(id: string) {
    return Category.findById(id).lean();
  }

  findCategoryBySlug(slug: string) {
    return Category.findOne({ slug, isActive: true }).select("_id").lean();
  }

  findOneCategoryBy(query: Query) {
    return Category.findOne(query).lean();
  }

  createCategory(data: any) {
    return Category.create(data);
  }

  async findCategoryIdsWithDescendants(identifier: string) {
    const isObjectId = mongoose.Types.ObjectId.isValid(identifier);
    const query = isObjectId ? { _id: identifier } : { slug: identifier, isActive: true };
    const root = await Category.findOne(query)
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
  }

  // ── Variant Methods (Part of Product Aggregate) ─────────────────────────
  async findSaleProductIds(): Promise<string[]> {
    const saleVariants = await Variant.find(
      { discountPrice: { $gt: 0 } },
      { productId: 1 }
    ).lean();
    return [...new Set(saleVariants.map((v: any) => v.productId.toString()))];
  }

  async findProductIdsByVariantSearch(search: string): Promise<string[]> {
    const matchingVariants = await Variant.find({
      $or: [
        { barcode: { $regex: search, $options: "i" } },
        { sku: { $regex: search, $options: "i" } },
      ],
    })
      .select("productId")
      .lean();
    return matchingVariants.map((v: any) => v.productId.toString());
  }

  async findProductIdsByVariantStock(minStock?: number, maxStock?: number): Promise<string[]> {
    const stockQuery: any = {};
    if (minStock !== undefined) stockQuery.$gte = Number(minStock);
    if (maxStock !== undefined) stockQuery.$lte = Number(maxStock);
    const matchingVariants = await Variant.find({ stock: stockQuery })
      .select("productId")
      .lean();
    return matchingVariants.map((v: any) => v.productId.toString());
  }

  async createVariants(variants: any[]) {
    return Variant.insertMany(variants);
  }

  async deleteVariantsExcept(productId: string, variantIdsToKeep: string[]) {
    return Variant.deleteMany({
      productId,
      _id: { $nin: variantIdsToKeep },
    });
  }

  async updateVariant(id: string, payload: any) {
    return Variant.updateOne({ _id: id }, { $set: payload });
  }

  async createVariant(payload: any) {
    return Variant.create(payload);
  }

  async findVariantIdsByProductId(productId: string): Promise<string[]> {
    const variants = await Variant.find({ productId }).select("_id").lean();
    return variants.map((v: any) => v._id.toString());
  }

  async countProductsByBrandIds(brandIds: string[]): Promise<any[]> {
    const { Types } = mongoose;
    return Product.aggregate([
      { $match: { brandId: { $in: brandIds.map((id) => new Types.ObjectId(id)) } } },
      { $group: { _id: "$brandId", count: { $sum: 1 } } },
    ]);
  }

  async countProductsByBrandId(brandId: string): Promise<number> {
    return Product.countDocuments({ brandId });
  }

  async findVariantById(id: string) {
    return Variant.findById(id).lean();
  }

  async deleteVariantsByProductId(productId: string) {
    return Variant.deleteMany({ productId });
  }
}
