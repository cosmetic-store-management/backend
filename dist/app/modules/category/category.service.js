import * as categoryRepo from "./category.repository.js";
import { mapCategory } from "./dto/category.response.dto.js";
import { badRequest, notFound, conflict } from "../../shared/errors/httpErrors.js";
import mongoose from "mongoose";
const slugify = (text) => text.toString().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
const parseParentId = async (parentId) => {
    if (!parentId)
        return null;
    if (!mongoose.Types.ObjectId.isValid(parentId)) {
        throw badRequest("Parent category id is invalid");
    }
    const parent = await categoryRepo.findById(parentId);
    if (!parent)
        throw notFound("Parent category not found");
    return parent._id;
};
// ── PUBLIC ────────────────────────────────────────────────────────────────────
export const getPublicCategories = async () => {
    // Fetch all active categories to build the tree, regardless of product count
    const categories = await categoryRepo.findAll({ isActive: true }, 0, 1000);
    const countsMap = await categoryRepo.countProductsByCategoryIds(categories.map(c => c._id));
    const mapped = categories.map((cat) => {
        cat.productCount = countsMap.get(cat._id.toString()) || 0;
        return mapCategory(cat);
    });
    // Build tree
    const categoryMap = new Map();
    mapped.forEach(c => categoryMap.set(c.id, { ...c, children: [] }));
    const tree = [];
    categoryMap.forEach(c => {
        if (c.parentId && categoryMap.has(c.parentId)) {
            categoryMap.get(c.parentId).children.push(c);
        }
        else {
            tree.push(c);
        }
    });
    // Tích luỹ productCount từ lá lên gốc: parent = sum của direct + tất cả descendants
    const accumulateCounts = (node) => {
        let total = node.productCount || 0;
        for (const child of node.children || []) {
            total += accumulateCounts(child);
        }
        node.productCount = total;
        return total;
    };
    tree.forEach(root => accumulateCounts(root));
    return tree;
};
export const getPublicCategoryDetail = async (slug) => {
    const category = await categoryRepo.findOneBy({ slug, isActive: true });
    if (!category)
        throw notFound("Không tìm thấy danh mục");
    return mapCategory(category);
};
export const getAdminCategories = async ({ search, status, page = 1, limit = 20 }) => {
    const parsedPage = Math.max(Number(page) || 1, 1);
    const parsedLimit = Math.max(Number(limit) || 20, 1);
    const skip = (parsedPage - 1) * parsedLimit;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query = {};
    if (search)
        query.name = { $regex: search.trim(), $options: "i" };
    if (status === "active")
        query.isActive = true;
    else if (status === "inactive")
        query.isActive = false;
    const [categories, total] = await Promise.all([
        categoryRepo.findAll(query, skip, parsedLimit),
        categoryRepo.countAll(query),
    ]);
    const countsMap = await categoryRepo.countProductsByCategoryIds(categories.map(c => c._id));
    return {
        categories: categories.map((cat) => {
            cat.productCount = countsMap.get(cat._id.toString()) || 0;
            return mapCategory(cat);
        }),
        pagination: { page: parsedPage, limit: parsedLimit, total, totalPages: Math.ceil(total / parsedLimit) },
    };
};
export const getAdminCategoryDetail = async (id) => {
    const category = await categoryRepo.findById(id);
    if (!category)
        throw notFound("Không tìm thấy danh mục");
    return mapCategory(category);
};
export const createCategory = async (data) => {
    const slug = slugify(data.name);
    const existing = await categoryRepo.findBySlug(slug);
    if (existing)
        throw conflict("Slug danh mục đã tồn tại");
    const parentId = await parseParentId(data.parentId);
    const newCategory = await categoryRepo.create({ ...data, parentId, slug });
    return mapCategory(newCategory);
};
export const updateCategory = async (id, data) => {
    const category = await categoryRepo.findById(id);
    if (!category)
        throw notFound("Không tìm thấy danh mục");
    if (data.name !== undefined) {
        const nextSlug = slugify(data.name);
        const existing = await categoryRepo.findOneBy({ slug: nextSlug, _id: { $ne: category._id } });
        if (existing)
            throw conflict("Slug danh mục đã tồn tại");
        category.name = data.name;
        category.slug = nextSlug;
    }
    if (data.description !== undefined)
        category.description = data.description;
    if (data.imageUrl !== undefined)
        category.imageUrl = data.imageUrl;
    if (data.iconUrl !== undefined)
        category.iconUrl = data.iconUrl;
    if (data.bannerUrl !== undefined)
        category.bannerUrl = data.bannerUrl;
    if (data.parentId !== undefined)
        category.parentId = await parseParentId(data.parentId);
    if (data.isActive !== undefined)
        category.isActive = data.isActive;
    if (data.sortOrder !== undefined)
        category.sortOrder = data.sortOrder;
    // Prevent self-referencing parentId
    if (category.parentId && category.parentId.toString() === category._id.toString()) {
        throw badRequest("Danh mục không thể là cha của chính nó");
    }
    await categoryRepo.save(category);
    return mapCategory(category);
};
export const updateCategoryStatus = async (id, isActive) => {
    const category = await categoryRepo.findById(id);
    if (!category)
        throw notFound("Không tìm thấy danh mục");
    category.isActive = isActive;
    await categoryRepo.save(category);
    return mapCategory(category);
};
export const deleteCategory = async (id) => {
    const category = await categoryRepo.findById(id);
    if (!category)
        throw notFound("Không tìm thấy danh mục");
    const hasProducts = await categoryRepo.hasProducts(category._id.toString());
    if (hasProducts)
        throw badRequest("Không thể xóa danh mục đang có sản phẩm");
    await categoryRepo.deleteById(id);
};
