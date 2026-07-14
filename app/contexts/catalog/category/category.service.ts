import { injectable, inject } from "tsyringe";
import { CategoryRepository } from "./category.repository.js";
import { mapCategory } from "./dto/category.response.dto.js";
import { badRequest, notFound, conflict } from "../../../shared/errors/httpErrors.js";
import type { CreateCategoryInput, UpdateCategoryInput } from "./dto/category.request.dto.js";
import mongoose from "mongoose";
import NodeCache from "node-cache";

const slugify = (text: string): string =>
  text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

const categoryCache = new NodeCache({ stdTTL: 3600 });
const PUBLIC_CACHE_KEY = "PUBLIC_CATEGORIES";

interface AdminCategoryQuery {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}

@injectable()
export class CategoryService {
  constructor(
    @inject(CategoryRepository) private readonly categoryRepo: CategoryRepository
  ) {}

  private async parseParentId(parentId: string | null | undefined) {
    if (!parentId) return null;
    if (!mongoose.Types.ObjectId.isValid(parentId)) {
      throw badRequest("Parent category id is invalid");
    }

    const parent = await this.categoryRepo.findById(parentId);
    if (!parent) throw notFound("Parent category not found");
    return parent._id;
  }

  private async getRecursiveCountsMap() {
    const allCatsResult = await this.categoryRepo.findAll({}, 1, 5000);
    const allCategories = allCatsResult.categories;
    const directCountsMap = await this.categoryRepo.countProductsByCategoryIds(
      allCategories.map((c) => c._id as any),
    );

    const categoryMap = new Map<string, any>();
    allCategories.forEach((cat) => {
      categoryMap.set(cat._id.toString(), {
        _id: cat._id.toString(),
        parentId: cat.parentId?.toString() || null,
        productCount: directCountsMap.get(cat._id.toString()) || 0,
        children: [],
      });
    });

    const tree: any[] = [];
    categoryMap.forEach((c) => {
      if (c.parentId && categoryMap.has(c.parentId)) {
        categoryMap.get(c.parentId).children.push(c);
      } else {
        tree.push(c);
      }
    });

    const accumulateCounts = (node: any): number => {
      let total = node.productCount || 0;
      for (const child of node.children || []) {
        total += accumulateCounts(child);
      }
      node.productCount = total;
      return total;
    };
    tree.forEach((root) => accumulateCounts(root));

    return categoryMap;
  }

  async getPublicCategories() {
    const cached = categoryCache.get(PUBLIC_CACHE_KEY);
    if (cached) return cached;

    const result = await this.categoryRepo.findAll({ isActive: true }, 1, 1000);
    const categories = result.categories;
    const countsMap = await this.categoryRepo.countProductsByCategoryIds(
      categories.map((c) => c._id as any),
    );

    const mapped = categories.map((cat) => {
      (cat as any).productCount = countsMap.get(cat._id.toString()) || 0;
      return mapCategory(cat);
    });

    const categoryMap = new Map<string, any>();
    mapped.forEach((c) => categoryMap.set(c.id, { ...c, children: [] }));

    const tree: any[] = [];
    categoryMap.forEach((c) => {
      if (c.parentId && categoryMap.has(c.parentId)) {
        categoryMap.get(c.parentId).children.push(c);
      } else {
        tree.push(c);
      }
    });

    const accumulateCounts = (node: any): number => {
      let total = node.productCount || 0;
      for (const child of node.children || []) {
        total += accumulateCounts(child);
      }
      node.productCount = total;
      return total;
    };
    tree.forEach((root) => accumulateCounts(root));

    categoryCache.set(PUBLIC_CACHE_KEY, tree);
    return tree;
  }

  async getPublicCategoryDetail(slug: string) {
    const category = await this.categoryRepo.findOneBy({ slug, isActive: true });
    if (!category) throw notFound("Category not found");
    return mapCategory(category);
  }

  async getAdminCategories({ search, status, page = 1, limit = 20 }: AdminCategoryQuery) {
    const parsedLimit = Math.max(Number(limit) || 20, 1);
    const parsedPage = Math.max(Number(page) || 1, 1);

    const query: Record<string, any> = {};
    if (search) query.name = { $regex: search.trim(), $options: "i" };
    if (status === "active") query.isActive = true;
    else if (status === "inactive") query.isActive = false;

    const [result, total, countsMap] = await Promise.all([
      this.categoryRepo.findAll(query, parsedPage, parsedLimit),
      this.categoryRepo.countAll(query),
      this.getRecursiveCountsMap(),
    ]);
    
    const categories = result.categories;

    return {
      categories: categories.map((cat) => {
        (cat as any).productCount = countsMap.get(cat._id.toString())?.productCount || 0;
        return mapCategory(cat);
      }),
      pagination: {
        limit: parsedLimit,
        total,
        page: result.page,
        totalPages: result.totalPages,
      },
    };
  }

  async getAdminCategoryDetail(id: string) {
    const category = await this.categoryRepo.findById(id);
    if (!category) throw notFound("Category not found");
    return mapCategory(category);
  }

  async createCategory(data: CreateCategoryInput) {
    const slug = slugify(data.name);
    const existing = await this.categoryRepo.findBySlug(slug);
    if (existing) throw conflict("Category slug already exists");
    const parentId = await this.parseParentId(data.parentId);

    let sortOrder = data.sortOrder;
    if (sortOrder === undefined || sortOrder === 1) {
      const maxOrder = await this.categoryRepo.findMaxSortOrder(parentId);
      if (maxOrder > 0 || (await this.categoryRepo.findOneBy({ parentId, sortOrder: 1 }))) {
        sortOrder = maxOrder + 1;
      } else {
        sortOrder = 1;
      }
    }

    const newCategory = await this.categoryRepo.create({
      ...data,
      parentId,
      slug,
      sortOrder,
    });
    categoryCache.del(PUBLIC_CACHE_KEY);
    return mapCategory(newCategory);
  }

  async updateCategory(id: string, data: UpdateCategoryInput) {
    const category = await this.categoryRepo.findById(id);
    if (!category) throw notFound("Category not found");

    if (data.name !== undefined) {
      const nextSlug = slugify(data.name);
      const existing = await this.categoryRepo.findOneBy({
        slug: nextSlug,
        _id: { $ne: category._id },
      });
      if (existing) throw conflict("Category slug already exists");
      category.name = data.name;
      category.slug = nextSlug;
    }

    if (data.description !== undefined) category.description = data.description;
    if (data.imageUrl !== undefined) category.imageUrl = data.imageUrl;
    if (data.iconUrl !== undefined) category.iconUrl = data.iconUrl;
    if (data.bannerUrl !== undefined) category.bannerUrl = data.bannerUrl;
    if (data.parentId !== undefined)
      category.parentId = await this.parseParentId(data.parentId);
    if (data.isActive !== undefined) category.isActive = data.isActive;
    if (data.sortOrder !== undefined) category.sortOrder = data.sortOrder;

    if (
      category.parentId &&
      category.parentId.toString() === category._id.toString()
    ) {
      throw badRequest("A category cannot be its own parent");
    }

    await this.categoryRepo.save(category);
    categoryCache.del(PUBLIC_CACHE_KEY);
    return mapCategory(category);
  }

  async updateCategoryStatus(id: string, isActive: boolean) {
    const category = await this.categoryRepo.findById(id);
    if (!category) throw notFound("Category not found");
    category.isActive = isActive;
    await this.categoryRepo.save(category);
    categoryCache.del(PUBLIC_CACHE_KEY);
    return mapCategory(category);
  }

  async deleteCategory(id: string) {
    const category = await this.categoryRepo.findById(id);
    if (!category) throw notFound("Category not found");
    const hasProducts = await this.categoryRepo.hasProducts(category._id.toString());
    if (hasProducts) throw badRequest("Cannot delete a category that has products in it");
    await this.categoryRepo.deleteById(id);
    categoryCache.del(PUBLIC_CACHE_KEY);
  }
}
