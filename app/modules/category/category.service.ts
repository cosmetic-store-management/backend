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
  const result = await categoryRepo.findAll({ isActive: true }, null, 1000);
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
  if (!category) throw notFound("Không tìm thấy danh mục");
  return mapCategory(category);
};

// ── ADMIN ─────────────────────────────────────────────────────────────────────

interface AdminCategoryQuery {
  search?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}

export const getAdminCategories = async ({
  search,
  status,
  cursor,
  limit = 20,
}: AdminCategoryQuery) => {
  const parsedLimit = Math.max(Number(limit) || 20, 1);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {};
  if (search) query.name = { $regex: search.trim(), $options: "i" };
  if (status === "active") query.isActive = true;
  else if (status === "inactive") query.isActive = false;

  const [result, total] = await Promise.all([
    categoryRepo.findAll(query, cursor || null, parsedLimit),
    categoryRepo.countAll(query),
  ]);
  const categories = result.categories;

  const countsMap = await categoryRepo.countProductsByCategoryIds(
    categories.map((c) => c._id as any),
  );

  return {
    categories: categories.map((cat) => {
      (cat as any).productCount = countsMap.get(cat._id.toString()) || 0;
      return mapCategory(cat);
    }),
    pagination: {
      limit: parsedLimit,
      total,
      nextCursor: result.nextCursor,
      hasNextPage: result.hasNextPage,
    },
  };
};

export const getAdminCategoryDetail = async (id: string) => {
  const category = await categoryRepo.findById(id);
  if (!category) throw notFound("Không tìm thấy danh mục");
  return mapCategory(category);
};

export const createCategory = async (data: CreateCategoryInput) => {
  const slug = slugify(data.name);
  const existing = await categoryRepo.findBySlug(slug);
  if (existing) throw conflict("Slug danh mục đã tồn tại");
  const parentId = await parseParentId(data.parentId);
  const newCategory = await categoryRepo.create({ ...data, parentId, slug });
  return mapCategory(newCategory);
};

export const updateCategory = async (id: string, data: UpdateCategoryInput) => {
  const category = await categoryRepo.findById(id);
  if (!category) throw notFound("Không tìm thấy danh mục");

  if (data.name !== undefined) {
    const nextSlug = slugify(data.name);
    const existing = await categoryRepo.findOneBy({
      slug: nextSlug,
      _id: { $ne: category._id },
    });
    if (existing) throw conflict("Slug danh mục đã tồn tại");
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
  if (!category) throw notFound("Không tìm thấy danh mục");
  category.isActive = isActive;
  await categoryRepo.save(category);
  return mapCategory(category);
};

export const deleteCategory = async (id: string) => {
  const category = await categoryRepo.findById(id);
  if (!category) throw notFound("Không tìm thấy danh mục");
  const hasProducts = await categoryRepo.hasProducts(category._id.toString());
  if (hasProducts) throw badRequest("Không thể xóa danh mục đang có sản phẩm");
  await categoryRepo.deleteById(id);
};
