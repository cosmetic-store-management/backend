import * as categoryRepo from "./category.repository.js";
import { mapCategory } from "./dto/category.response.dto.js";
import {
  badRequest,
  notFound,
  conflict,
} from "../../shared/errors/httpErrors.js";
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
} from "./dto/category.request.dto.js";
import mongoose from "mongoose";

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

const parseParentId = async (parentId: string | null | undefined) => {
  if (!parentId) return null;
  if (!mongoose.Types.ObjectId.isValid(parentId)) {
    throw badRequest("Parent category id is invalid");
  }

  const parent = await categoryRepo.findById(parentId);
  if (!parent) throw notFound("Parent category not found");
  return parent._id;
};

// ── PUBLIC ────────────────────────────────────────────────────────────────────

// ── Cache for Public Categories ───────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalCache = (global as any).__catCache || { data: null, expiresAt: 0 };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__catCache = globalCache;

export const getPublicCategories = async () => {
  const now = Date.now();
  if (globalCache.data && globalCache.expiresAt > now) {
    return globalCache.data;
  }

  // Fetch all active categories to build the tree, regardless of product count
  const result = await categoryRepo.findAll({ isActive: true }, 1, 1000);
  const categories = result.categories;
  const countsMap = await categoryRepo.countProductsByCategoryIds(
    categories.map((c) => c._id as any),
  );

  const mapped = categories.map((cat) => {
    (cat as any).productCount = countsMap.get(cat._id.toString()) || 0;
    return mapCategory(cat);
  });

  // Build tree
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

  // Tích luỹ productCount từ lá lên gốc: parent = sum của direct + tất cả descendants
  const accumulateCounts = (node: any): number => {
    let total = node.productCount || 0;
    for (const child of node.children || []) {
      total += accumulateCounts(child);
    }
    node.productCount = total;
    return total;
  };
  tree.forEach((root) => accumulateCounts(root));

  return tree;
};

export const getPublicCategoryDetail = async (slug: string) => {
  const category = await categoryRepo.findOneBy({ slug, isActive: true });
  if (!category) throw notFound("Category not found");
  return mapCategory(category);
};

// ── Helper ──────────────────────────────────────────────────────────────────────
const getRecursiveCountsMap = async () => {
  const allCatsResult = await categoryRepo.findAll({}, 1, 5000);
  const allCategories = allCatsResult.categories;
  const directCountsMap = await categoryRepo.countProductsByCategoryIds(
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
};

// ── ADMIN ─────────────────────────────────────────────────────────────────────

interface AdminCategoryQuery {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export const getAdminCategories = async ({
  search,
  status,
  page = 1,
  limit = 20,
}: AdminCategoryQuery) => {
  const parsedLimit = Math.max(Number(limit) || 20, 1);
  const parsedPage = Math.max(Number(page) || 1, 1);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {};
  if (search) query.name = { $regex: search.trim(), $options: "i" };
  if (status === "active") query.isActive = true;
  else if (status === "inactive") query.isActive = false;

  const [result, total, countsMap] = await Promise.all([
    categoryRepo.findAll(query, parsedPage, parsedLimit),
    categoryRepo.countAll(query),
    getRecursiveCountsMap(),
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
};

export const getAdminCategoryDetail = async (id: string) => {
  const category = await categoryRepo.findById(id);
  if (!category) throw notFound("Category not found");
  return mapCategory(category);
};

export const createCategory = async (data: CreateCategoryInput) => {
  const slug = slugify(data.name);
  const existing = await categoryRepo.findBySlug(slug);
  if (existing) throw conflict("Category slug already exists");
  const parentId = await parseParentId(data.parentId);
  const newCategory = await categoryRepo.create({ ...data, parentId, slug });
  return mapCategory(newCategory);
};

export const updateCategory = async (id: string, data: UpdateCategoryInput) => {
  const category = await categoryRepo.findById(id);
  if (!category) throw notFound("Category not found");

  if (data.name !== undefined) {
    const nextSlug = slugify(data.name);
    const existing = await categoryRepo.findOneBy({
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
    category.parentId = await parseParentId(data.parentId);
  if (data.isActive !== undefined) category.isActive = data.isActive;
  if (data.sortOrder !== undefined) category.sortOrder = data.sortOrder;

  // Prevent self-referencing parentId
  if (
    category.parentId &&
    category.parentId.toString() === category._id.toString()
  ) {
    throw badRequest("Danh mục không thể là cha của chính nó");
  }

  await categoryRepo.save(category);
  return mapCategory(category);
};

export const updateCategoryStatus = async (id: string, isActive: boolean) => {
  const category = await categoryRepo.findById(id);
  if (!category) throw notFound("Category not found");
  category.isActive = isActive;
  await categoryRepo.save(category);
  return mapCategory(category);
};

export const deleteCategory = async (id: string) => {
  const category = await categoryRepo.findById(id);
  if (!category) throw notFound("Category not found");
  const hasProducts = await categoryRepo.hasProducts(category._id.toString());
  if (hasProducts) throw badRequest("Không thể xóa danh mục đang có sản phẩm");
  await categoryRepo.deleteById(id);
};
