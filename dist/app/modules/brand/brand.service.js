import * as brandRepo from "./brand.repository.js";
import { mapBrand } from "./dto/brand.response.dto.js";
import { notFound, conflict } from "../../shared/errors/httpErrors.js";
const slugify = (text) => text.toString().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
// ── Helper: batch product counts for brand IDs ─────────────────────────────────
const getBrandProductCounts = async (brandIds) => {
    if (!brandIds.length)
        return {};
    const { default: Product } = await import("../../models/product.schema.js");
    const { Types } = await import("mongoose");
    const results = await Product.aggregate([
        { $match: { brandId: { $in: brandIds.map(id => new Types.ObjectId(id)) } } },
        { $group: { _id: "$brandId", count: { $sum: 1 } } },
    ]);
    return Object.fromEntries(results.map((r) => [r._id.toString(), r.count]));
};
// ── PUBLIC ────────────────────────────────────────────────────────────────────
export const getPublicBrands = async () => {
    const brands = await brandRepo.findAll({ isActive: true }, 0, 500);
    const brandIds = brands.map((b) => b._id.toString());
    const countMap = await getBrandProductCounts(brandIds);
    return brands
        .map(b => mapBrand(b, countMap[b._id.toString()] ?? 0))
        .filter(b => b.productCount > 0)
        .sort((a, b) => b.productCount - a.productCount);
};
export const getAdminBrands = async ({ search, status, page = 1, limit = 50 }) => {
    const parsedPage = Math.max(Number(page) || 1, 1);
    const parsedLimit = Math.max(Number(limit) || 50, 1);
    const skip = (parsedPage - 1) * parsedLimit;
    const query = {};
    if (search)
        query.name = { $regex: search.trim(), $options: "i" };
    if (status === "active")
        query.isActive = true;
    else if (status === "inactive")
        query.isActive = false;
    const [brands, total] = await Promise.all([
        brandRepo.findAll(query, skip, parsedLimit),
        brandRepo.countAll(query),
    ]);
    // Batch-fetch product counts (single aggregate — industry standard)
    const brandIds = brands.map((b) => b._id.toString());
    const countMap = await getBrandProductCounts(brandIds);
    return {
        brands: brands.map(b => mapBrand(b, countMap[b._id.toString()] ?? 0)),
        pagination: { page: parsedPage, limit: parsedLimit, total, totalPages: Math.ceil(total / parsedLimit) },
    };
};
export const getBrandDetail = async (id) => {
    const brand = await brandRepo.findById(id);
    if (!brand)
        throw notFound("Không tìm thấy thương hiệu");
    const countMap = await getBrandProductCounts([id]);
    return mapBrand(brand, countMap[id] ?? 0);
};
export const createBrand = async (data) => {
    const slug = slugify(data.name);
    const existing = await brandRepo.findBySlug(slug);
    if (existing)
        throw conflict("Tên/Slug thương hiệu đã tồn tại");
    const newBrand = await brandRepo.create({ ...data, slug });
    return mapBrand(newBrand, 0);
};
export const updateBrand = async (id, data) => {
    const brand = await brandRepo.findById(id);
    if (!brand)
        throw notFound("Không tìm thấy thương hiệu");
    if (data.name !== undefined) {
        const nextSlug = slugify(data.name);
        const existing = await brandRepo.findOneBy({ slug: nextSlug, _id: { $ne: brand._id } });
        if (existing)
            throw conflict("Tên/Slug thương hiệu đã tồn tại");
        brand.name = data.name;
        brand.slug = nextSlug;
    }
    if (data.description !== undefined)
        brand.description = data.description;
    if (data.isActive !== undefined)
        brand.isActive = data.isActive;
    if (data.imageUrl !== undefined)
        brand.imageUrl = data.imageUrl;
    if (data.country !== undefined)
        brand.country = data.country;
    await brandRepo.save(brand);
    const countMap = await getBrandProductCounts([id]);
    return mapBrand(brand, countMap[id] ?? 0);
};
export const updateBrandStatus = async (id, isActive) => {
    const brand = await brandRepo.findById(id);
    if (!brand)
        throw notFound("Không tìm thấy thương hiệu");
    brand.isActive = isActive;
    await brandRepo.save(brand);
    const countMap = await getBrandProductCounts([id]);
    return mapBrand(brand, countMap[id] ?? 0);
};
export const deleteBrand = async (id) => {
    const brand = await brandRepo.findById(id);
    if (!brand)
        throw notFound("Không tìm thấy thương hiệu");
    const { default: Product } = await import("../../models/product.schema.js");
    const productCount = await Product.countDocuments({ brandId: id });
    if (productCount > 0)
        throw conflict(`Không thể xoá thương hiệu đang có ${productCount} sản phẩm. Vui lòng xoá hoặc chuyển sản phẩm sang thương hiệu khác trước.`);
    await brandRepo.deleteById(id);
};
