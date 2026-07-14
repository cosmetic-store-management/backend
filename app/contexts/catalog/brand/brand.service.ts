import { injectable, inject } from "tsyringe";
import { BrandRepository } from "./brand.repository.js";
import { mapBrand } from "./dto/brand.response.dto.js";
import { notFound, conflict } from "../../../shared/errors/httpErrors.js";
import type { CreateBrandInput, UpdateBrandInput } from "./dto/brand.request.dto.js";
import NodeCache from "node-cache";

const brandCache = new NodeCache({ stdTTL: 3600 });
const PUBLIC_CACHE_KEY = "PUBLIC_BRANDS";

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

import { ProductRepository } from "../product/product.repository.js";
import { InventoryRepository } from "../inventory/inventory.repository.js";

interface AdminBrandQuery {
  search?: string;
  status?: string;
  country?: string;
  page?: number;
  limit?: number;
}

@injectable()
export class BrandService {
  constructor(
    @inject(BrandRepository) private readonly brandRepo: BrandRepository,
    @inject(ProductRepository) private readonly productRepo: ProductRepository,
    @inject(InventoryRepository) private readonly inventoryRepo: InventoryRepository
  ) {}

  private async getBrandProductCounts(brandIds: string[]): Promise<Record<string, number>> {
    if (!brandIds.length) return {};
    const results = await this.productRepo.countProductsByBrandIds(brandIds);
    return Object.fromEntries(results.map((r: any) => [r._id.toString(), r.count]));
  }

  private async ensureSupplierLinked(brandDoc: any) {
    if (!brandDoc) return brandDoc;
    if (brandDoc.supplierId) return brandDoc;

    if (brandDoc.supplierName && brandDoc.supplierName.trim()) {
      const name = brandDoc.supplierName.trim();
      const phone = brandDoc.contactPhone?.trim() || "0000000000";
      const email = brandDoc.contactEmail?.trim() || "";

      let supplier = await this.inventoryRepo.findSupplierByName(name);
      if (!supplier) {
        supplier = await this.inventoryRepo.createSupplier({ name, phone, email, address: "Migrated from Brand data" });
      }

      brandDoc.supplierId = supplier._id;
      if (typeof brandDoc.save === "function") {
        await this.brandRepo.save(brandDoc);
      } else {
        await this.brandRepo.updateById(brandDoc._id.toString(), { supplierId: supplier._id });
        brandDoc.supplierId = supplier; 
      }
    }
    return brandDoc;
  }

  async getPublicBrands() {
    const cached = brandCache.get(PUBLIC_CACHE_KEY);
    if (cached) return cached;

    const result = await this.brandRepo.findAll({ isActive: true }, 1, 500);
    const brands = result.brands;
    const brandIds = brands.map((b: any) => b._id.toString());
    const countMap = await this.getBrandProductCounts(brandIds);

    const response = brands
      .map((b) => mapBrand(b, countMap[b._id.toString()] ?? 0))
      .filter((b) => b.productCount > 0)
      .sort((a, b) => b.productCount - a.productCount);

    brandCache.set(PUBLIC_CACHE_KEY, response);
    return response;
  }

  async getAdminBrands({ search, status, country, page = 1, limit = 50 }: AdminBrandQuery) {
    const parsedLimit = Math.max(Number(limit) || 50, 1);
    const parsedPage = Math.max(Number(page) || 1, 1);

    const query: Record<string, any> = {};
    if (search) query.name = { $regex: search.trim(), $options: "i" };
    if (status === "active") query.isActive = true;
    else if (status === "inactive") query.isActive = false;
    if (country) query.country = { $regex: `^${country.trim()}$`, $options: "i" };

    const [result, total] = await Promise.all([
      this.brandRepo.findAll(query, parsedPage, parsedLimit),
      this.brandRepo.countAll(query),
    ]);
    const brands = result.brands;

    const brandIds = brands.map((b: any) => b._id.toString());
    const countMap = await this.getBrandProductCounts(brandIds);

    const migratedBrands = await Promise.all(
      brands.map(async (b) => {
        const updated = await this.ensureSupplierLinked(b);
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
  }

  async getBrandDetail(id: string) {
    const brand = await this.brandRepo.findById(id);
    if (!brand) throw notFound("Brand not found");
    const linkedBrand = await this.ensureSupplierLinked(brand);
    const countMap = await this.getBrandProductCounts([id]);
    return mapBrand(linkedBrand, countMap[id] ?? 0);
  }

  async createBrand(data: CreateBrandInput) {
    const slug = slugify(data.name);
    const existing = await this.brandRepo.findBySlug(slug);
    if (existing) throw conflict("Brand Name/Slug already exists");

    let supplierName = "";
    let contactPhone = "";
    let contactEmail = "";
    if (data.supplierId) {
      const supplierDoc = await this.inventoryRepo.findSupplierById(data.supplierId);
      if (supplierDoc) {
        supplierName = supplierDoc.name;
        contactPhone = supplierDoc.contactPhone || supplierDoc.phone;
        contactEmail = supplierDoc.contactEmail || supplierDoc.email;
      }
    }

    const newBrand = await this.brandRepo.create({
      ...data,
      slug,
      supplierName,
      contactPhone,
      contactEmail,
    });

    let populatedBrand = newBrand;
    if (newBrand.supplierId) {
      populatedBrand = await this.brandRepo.findById(newBrand._id.toString()) as any;
    }
    brandCache.del(PUBLIC_CACHE_KEY);
    return mapBrand(populatedBrand, 0);
  }

  async updateBrand(id: string, data: UpdateBrandInput) {
    const brand = await this.brandRepo.findById(id);
    if (!brand) throw notFound("Brand not found");

    if (data.name !== undefined) {
      const nextSlug = slugify(data.name);
      const existing = await this.brandRepo.findOneBy({
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
          const supplierDoc = await this.inventoryRepo.findSupplierById(nextSupplierId);
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

    await this.brandRepo.save(brand);
    const updatedBrand = await this.brandRepo.findById(id);
    const countMap = await this.getBrandProductCounts([id]);
    brandCache.del(PUBLIC_CACHE_KEY);
    return mapBrand(updatedBrand!, countMap[id] ?? 0);
  }

  async updateBrandStatus(id: string, isActive: boolean) {
    const brand = await this.brandRepo.findById(id);
    if (!brand) throw notFound("Brand not found");
    brand.isActive = isActive;
    await this.brandRepo.save(brand);
    const countMap = await this.getBrandProductCounts([id]);
    brandCache.del(PUBLIC_CACHE_KEY);
    return mapBrand(brand, countMap[id] ?? 0);
  }

  async deleteBrand(id: string) {
    const brand = await this.brandRepo.findById(id);
    if (!brand) throw notFound("Brand not found");

    const productCount = await this.productRepo.countProductsByBrandId(id);
    if (productCount > 0)
      throw conflict(`Cannot delete a brand that has ${productCount} products. Please delete or move the products to another brand first.`);

    await this.brandRepo.deleteById(id);
    brandCache.del(PUBLIC_CACHE_KEY);
  }
}
