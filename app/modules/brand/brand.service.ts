import * as brandRepo from "./brand.repository.js";
import { mapBrand } from "./dto/brand.response.dto.js";
import { notFound, conflict } from "../../shared/errors/httpErrors.js";
import type {
  CreateBrandInput,
  UpdateBrandInput,
} from "./dto/brand.request.dto.js";

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

// ── Helper: batch product counts for brand IDs ─────────────────────────────────
const getBrandProductCounts = async (
  brandIds: string[],
): Promise<Record<string, number>> => {
  if (!brandIds.length) return {};
  const { default: Product } =
    await import("../../models/product/product.schema.js");
  const { Types } = await import("mongoose");
  const results = await Product.aggregate([
    {
      $match: {
        brandId: { $in: brandIds.map((id) => new Types.ObjectId(id)) },
      },
    },
    { $group: { _id: "$brandId", count: { $sum: 1 } } },
  ]);
  return Object.fromEntries(
    results.map((r: any) => [r._id.toString(), r.count]),
  );
};

// ── PUBLIC ────────────────────────────────────────────────────────────────────

export const getPublicBrands = async () => {
  const result = await brandRepo.findAll({ isActive: true }, null, 500);
  const brands = result.brands;
  const brandIds = brands.map((b: any) => b._id.toString());
  const countMap = await getBrandProductCounts(brandIds);

  return brands
    .map((b) => mapBrand(b, countMap[b._id.toString()] ?? 0))
    .filter((b) => b.productCount > 0)
    .sort((a, b) => b.productCount - a.productCount);
};

// ── ADMIN ─────────────────────────────────────────────────────────────────────

interface AdminBrandQuery {
  search?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}

export const getAdminBrands = async ({
  search,
  status,
  cursor,
  limit = 50,
}: AdminBrandQuery) => {
  const parsedLimit = Math.max(Number(limit) || 50, 1);

  const query: Record<string, any> = {};
  if (search) query.name = { $regex: search.trim(), $options: "i" };
  if (status === "active") query.isActive = true;
  else if (status === "inactive") query.isActive = false;

  const [result, total] = await Promise.all([
    brandRepo.findAll(query, cursor || null, parsedLimit),
    brandRepo.countAll(query),
  ]);
  const brands = result.brands;

  // Batch-fetch product counts (single aggregate — industry standard)
  const brandIds = brands.map((b: any) => b._id.toString());
  const countMap = await getBrandProductCounts(brandIds);

  return {
    brands: brands.map((b) => mapBrand(b, countMap[b._id.toString()] ?? 0)),
    pagination: {
      limit: parsedLimit,
      total,
      nextCursor: result.nextCursor,
      hasNextPage: result.hasNextPage,
    },
  };
};

export const getBrandDetail = async (id: string) => {
  const brand = await brandRepo.findById(id);
  if (!brand) throw notFound("Không tìm thấy thương hiệu");
  const countMap = await getBrandProductCounts([id]);
  return mapBrand(brand, countMap[id] ?? 0);
};

export const createBrand = async (data: CreateBrandInput) => {
  const slug = slugify(data.name);
  const existing = await brandRepo.findBySlug(slug);
  if (existing) throw conflict("Tên/Slug thương hiệu đã tồn tại");
  const newBrand = await brandRepo.create({ ...data, slug });
  return mapBrand(newBrand, 0);
};

export const updateBrand = async (id: string, data: UpdateBrandInput) => {
  const brand = await brandRepo.findById(id);
  if (!brand) throw notFound("Không tìm thấy thương hiệu");

  if (data.name !== undefined) {
    const nextSlug = slugify(data.name);
    const existing = await brandRepo.findOneBy({
      slug: nextSlug,
      _id: { $ne: brand._id },
    });
    if (existing) throw conflict("Tên/Slug thương hiệu đã tồn tại");
    brand.name = data.name;
    brand.slug = nextSlug;
  }

  if (data.description !== undefined) brand.description = data.description;
  if (data.isActive !== undefined) brand.isActive = data.isActive;
  if (data.imageUrl !== undefined) brand.imageUrl = data.imageUrl;
  if (data.country !== undefined) brand.country = data.country;

  await brandRepo.save(brand);
  const countMap = await getBrandProductCounts([id]);
  return mapBrand(brand, countMap[id] ?? 0);
};

export const updateBrandStatus = async (id: string, isActive: boolean) => {
  const brand = await brandRepo.findById(id);
  if (!brand) throw notFound("Không tìm thấy thương hiệu");
  brand.isActive = isActive;
  await brandRepo.save(brand);
  const countMap = await getBrandProductCounts([id]);
  return mapBrand(brand, countMap[id] ?? 0);
};

export const deleteBrand = async (id: string) => {
  const brand = await brandRepo.findById(id);
  if (!brand) throw notFound("Không tìm thấy thương hiệu");

  const { default: Product } =
    await import("../../models/product/product.schema.js");
  const productCount = await Product.countDocuments({ brandId: id });
  if (productCount > 0)
    throw conflict(
      `Không thể xoá thương hiệu đang có ${productCount} sản phẩm. Vui lòng xoá hoặc chuyển sản phẩm sang thương hiệu khác trước.`,
    );

  await brandRepo.deleteById(id);
};
