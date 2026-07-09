import * as brandRepo from "./brand.repository.js";
import { mapBrand } from "./dto/brand.response.dto.js";
import { notFound, conflict } from "../../shared/errors/httpErrors.js";
const slugify = (text) => text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
// ── Helper: batch product counts for brand IDs ─────────────────────────────────
const getBrandProductCounts = async (brandIds) => {
    if (!brandIds.length)
        return {};
    const { default: Product } = await import("../product/models/product.schema.js");
    const { Types } = await import("mongoose");
    const results = await Product.aggregate([
        {
            $match: {
                brandId: { $in: brandIds.map((id) => new Types.ObjectId(id)) },
            },
        },
        { $group: { _id: "$brandId", count: { $sum: 1 } } },
    ]);
    return Object.fromEntries(results.map((r) => [r._id.toString(), r.count]));
};
// ── PUBLIC ────────────────────────────────────────────────────────────────────
export const getPublicBrands = async () => {
    const result = await brandRepo.findAll({ isActive: true }, 1, 500);
    const brands = result.brands;
    const brandIds = brands.map((b) => b._id.toString());
    const countMap = await getBrandProductCounts(brandIds);
    return brands
        .map((b) => mapBrand(b, countMap[b._id.toString()] ?? 0))
        .filter((b) => b.productCount > 0)
        .sort((a, b) => b.productCount - a.productCount);
};
export const getAdminBrands = async ({ search, status, country, page = 1, limit = 50, }) => {
    const parsedLimit = Math.max(Number(limit) || 50, 1);
    const parsedPage = Math.max(Number(page) || 1, 1);
    const query = {};
    if (search)
        query.name = { $regex: search.trim(), $options: "i" };
    if (status === "active")
        query.isActive = true;
    else if (status === "inactive")
        query.isActive = false;
    if (country)
        query.country = { $regex: `^${country.trim()}$`, $options: "i" };
    const [result, total] = await Promise.all([
        brandRepo.findAll(query, parsedPage, parsedLimit),
        brandRepo.countAll(query),
    ]);
    const brands = result.brands;
    // Batch-fetch product counts (single aggregate — industry standard)
    const brandIds = brands.map((b) => b._id.toString());
    const countMap = await getBrandProductCounts(brandIds);
    return {
        brands: brands.map((b) => mapBrand(b, countMap[b._id.toString()] ?? 0)),
        pagination: {
            limit: parsedLimit,
            total,
            page: result.page,
            totalPages: result.totalPages,
        },
    };
};
export const getBrandDetail = async (id) => {
    const brand = await brandRepo.findById(id);
    if (!brand)
        throw notFound("Brand not found");
    const countMap = await getBrandProductCounts([id]);
    return mapBrand(brand, countMap[id] ?? 0);
};
export const createBrand = async (data) => {
    const slug = slugify(data.name);
    const existing = await brandRepo.findBySlug(slug);
    if (existing)
        throw conflict("Brand Name/Slug already exists");
    const newBrand = await brandRepo.create({ ...data, slug });
    return mapBrand(newBrand, 0);
};
export const updateBrand = async (id, data) => {
    const brand = await brandRepo.findById(id);
    if (!brand)
        throw notFound("Brand not found");
    if (data.name !== undefined) {
        const nextSlug = slugify(data.name);
        const existing = await brandRepo.findOneBy({
            slug: nextSlug,
            _id: { $ne: brand._id },
        });
        if (existing)
            throw conflict("Brand Name/Slug already exists");
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
    if (data.website !== undefined)
        brand.website = data.website;
    if (data.contactPhone !== undefined)
        brand.contactPhone = data.contactPhone;
    if (data.contactEmail !== undefined)
        brand.contactEmail = data.contactEmail;
    if (data.supplierName !== undefined)
        brand.supplierName = data.supplierName;
    if (data.minimumOrderValue !== undefined)
        brand.minimumOrderValue = data.minimumOrderValue;
    if (data.leadTimeDays !== undefined)
        brand.leadTimeDays = data.leadTimeDays;
    await brandRepo.save(brand);
    const countMap = await getBrandProductCounts([id]);
    return mapBrand(brand, countMap[id] ?? 0);
};
export const updateBrandStatus = async (id, isActive) => {
    const brand = await brandRepo.findById(id);
    if (!brand)
        throw notFound("Brand not found");
    brand.isActive = isActive;
    await brandRepo.save(brand);
    const countMap = await getBrandProductCounts([id]);
    return mapBrand(brand, countMap[id] ?? 0);
};
export const deleteBrand = async (id) => {
    const brand = await brandRepo.findById(id);
    if (!brand)
        throw notFound("Brand not found");
    const { default: Product } = await import("../product/models/product.schema.js");
    const productCount = await Product.countDocuments({ brandId: id });
    if (productCount > 0)
        throw conflict(`Cannot delete a brand that has ${productCount} products. Please delete or move the products to another brand first.`);
    await brandRepo.deleteById(id);
};
