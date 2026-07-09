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
    await import("../product/models/product.schema.js");
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
  const result = await brandRepo.findAll({ isActive: true }, 1, 500);
  const brands = result.brands;
  const brandIds = brands.map((b: any) => b._id.toString());
  const countMap = await getBrandProductCounts(brandIds);

  return brands
    .map((b) => mapBrand(b, countMap[b._id.toString()] ?? 0))
    .filter((b) => b.productCount > 0)
    .sort((a, b) => b.productCount - a.productCount);
};

// ── Helper: auto-migrate/ensure brand is linked to a Supplier ───────────────────
const ensureSupplierLinked = async (brandDoc: any) => {
  if (!brandDoc) return brandDoc;
  if (brandDoc.supplierId) return brandDoc;

  // Legacy brand with supplierName
  if (brandDoc.supplierName && brandDoc.supplierName.trim()) {
    const name = brandDoc.supplierName.trim();
    const phone = brandDoc.contactPhone?.trim() || "0000000000";
    const email = brandDoc.contactEmail?.trim() || "";

    const { default: Supplier } = await import("../inventory/models/supplier.schema.js");

    // Find or create Supplier
    let supplier = await Supplier.findOne({ name: { $regex: `^${name}$`, $options: "i" } });
    if (!supplier) {
      supplier = await Supplier.create({
        name,
        phone,
        email,
        address: "Migrated from Brand data",
      });
    }

    // Update brand document
    brandDoc.supplierId = supplier._id;
    if (typeof brandDoc.save === "function") {
      await brandDoc.save();
    } else {
      const { default: Brand } = await import("./models/brand.schema.js");
      await Brand.findByIdAndUpdate(brandDoc._id, { supplierId: supplier._id });
      brandDoc.supplierId = supplier; // attach populated object for mapping
    }
  }
  return brandDoc;
};

// ── ADMIN ─────────────────────────────────────────────────────────────────────

interface AdminBrandQuery {
  search?: string;
  status?: string;
  country?: string;
  page?: number;
  limit?: number;
}

export const getAdminBrands = async ({
  search,
  status,
  country,
  page = 1,
  limit = 50,
 }: AdminBrandQuery) => {
  const parsedLimit = Math.max(Number(limit) || 50, 1);
  const parsedPage = Math.max(Number(page) || 1, 1);

  const query: Record<string, any> = {};
  if (search) query.name = { $regex: search.trim(), $options: "i" };
  if (status === "active") query.isActive = true;
  else if (status === "inactive") query.isActive = false;
  if (country) query.country = { $regex: `^${country.trim()}$`, $options: "i" };

  const [result, total] = await Promise.all([
    brandRepo.findAll(query, parsedPage, parsedLimit),
    brandRepo.countAll(query),
  ]);
  const brands = result.brands;

  // Batch-fetch product counts
  const brandIds = brands.map((b: any) => b._id.toString());
  const countMap = await getBrandProductCounts(brandIds);

  // Migrate legacy brands on the fly
  const migratedBrands = await Promise.all(
    brands.map(async (b) => {
      const updated = await ensureSupplierLinked(b);
      return updated;
    })
  );

  return {
    brands: migratedBrands.map((b) => mapBrand(b, countMap[b._id.toString()] ?? 0)),
    pagination: {
      limit: parsedLimit,
      total,
      page: result.page,
      totalPages: result.totalPages,
    },
  };
};

export const getBrandDetail = async (id: string) => {
  const brand = await brandRepo.findById(id);
  if (!brand) throw notFound("Brand not found");
  const linkedBrand = await ensureSupplierLinked(brand);
  const countMap = await getBrandProductCounts([id]);
  return mapBrand(linkedBrand, countMap[id] ?? 0);
};

export const createBrand = async (data: CreateBrandInput) => {
  const slug = slugify(data.name);
  const existing = await brandRepo.findBySlug(slug);
  if (existing) throw conflict("Brand Name/Slug already exists");

  let supplierName = "";
  let contactPhone = "";
  let contactEmail = "";
  if (data.supplierId) {
    const { default: Supplier } = await import("../inventory/models/supplier.schema.js");
    const supplierDoc = await Supplier.findById(data.supplierId);
    if (supplierDoc) {
      supplierName = supplierDoc.name;
      contactPhone = supplierDoc.contactPhone || supplierDoc.phone;
      contactEmail = supplierDoc.contactEmail || supplierDoc.email;
    }
  }

  const newBrand = await brandRepo.create({
    ...data,
    slug,
    supplierName,
    contactPhone,
    contactEmail,
  });

  let populatedBrand = newBrand;
  if (newBrand.supplierId) {
    populatedBrand = await brandRepo.findById(newBrand._id.toString()) as any;
  }
  return mapBrand(populatedBrand, 0);
};

export const updateBrand = async (id: string, data: UpdateBrandInput) => {
  const brand = await brandRepo.findById(id);
  if (!brand) throw notFound("Brand not found");

  if (data.name !== undefined) {
    const nextSlug = slugify(data.name);
    const existing = await brandRepo.findOneBy({
      slug: nextSlug,
      _id: { $ne: brand._id },
    });
    if (existing) throw conflict("Brand Name/Slug already exists");
    brand.name = data.name;
    brand.slug = nextSlug;
  }

  if (data.description !== undefined) brand.description = data.description;
  if (data.isActive !== undefined) brand.isActive = data.isActive;
  if (data.imageUrl !== undefined) brand.imageUrl = data.imageUrl;
  if (data.country !== undefined) brand.country = data.country;
  if ((data as any).website !== undefined) brand.website = (data as any).website;
  if ((data as any).contactPhone !== undefined) brand.contactPhone = (data as any).contactPhone;
  if ((data as any).contactEmail !== undefined) brand.contactEmail = (data as any).contactEmail;
  if ((data as any).supplierName !== undefined) brand.supplierName = (data as any).supplierName;
  if ((data as any).minimumOrderValue !== undefined) brand.minimumOrderValue = (data as any).minimumOrderValue;
  if ((data as any).leadTimeDays !== undefined) brand.leadTimeDays = (data as any).leadTimeDays;
  
  if ((data as any).supplierId !== undefined) {
    const nextSupplierId = (data as any).supplierId || null;
    if (nextSupplierId?.toString() !== brand.supplierId?.toString()) {
      brand.supplierId = nextSupplierId;
      if (nextSupplierId) {
        const { default: Supplier } = await import("../inventory/models/supplier.schema.js");
        const supplierDoc = await Supplier.findById(nextSupplierId);
        if (supplierDoc) {
          brand.supplierName = supplierDoc.name;
          brand.contactPhone = supplierDoc.contactPhone || supplierDoc.phone;
          brand.contactEmail = supplierDoc.contactEmail || supplierDoc.email;
        } else {
          brand.supplierName = "";
          brand.contactPhone = "";
          brand.contactEmail = "";
        }
      } else {
        brand.supplierName = "";
        brand.contactPhone = "";
        brand.contactEmail = "";
      }
    }
  }

  await brandRepo.save(brand);
  const updatedBrand = await brandRepo.findById(id);
  const countMap = await getBrandProductCounts([id]);
  return mapBrand(updatedBrand!, countMap[id] ?? 0);
};

export const updateBrandStatus = async (id: string, isActive: boolean) => {
  const brand = await brandRepo.findById(id);
  if (!brand) throw notFound("Brand not found");
  brand.isActive = isActive;
  await brandRepo.save(brand);
  const countMap = await getBrandProductCounts([id]);
  return mapBrand(brand, countMap[id] ?? 0);
};

export const deleteBrand = async (id: string) => {
  const brand = await brandRepo.findById(id);
  if (!brand) throw notFound("Brand not found");

  const { default: Product } =
    await import("../product/models/product.schema.js");
  const productCount = await Product.countDocuments({ brandId: id });
  if (productCount > 0)
    throw conflict(
      `Cannot delete a brand that has ${productCount} products. Please delete or move the products to another brand first.`,
    );

  await brandRepo.deleteById(id);
};
