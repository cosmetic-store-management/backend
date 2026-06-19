import mongoose from "mongoose";
import * as productRepo from "./product.repository.js";
import Variant from "../../models/variant.schema.js";
import { mapProduct } from "./dto/product.response.dto.js";
import { badRequest, notFound, conflict } from "../../shared/errors/httpErrors.js";
import { sanitizeRichText } from "../../shared/helpers/sanitize.js";
import type { CreateProductInput, UpdateProductInput } from "./dto/product.request.dto.js";

const slugify = (text: string): string =>
  text.toString().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

// ── PUBLIC ────────────────────────────────────────────────────────────────────

interface PublicProductQuery {
  category?: string;
  brandId?:  string;   // filter by brandId (source of truth)
  search?:   string;
  onSale?:   string;
  page?:     number;
  limit?:    number;
  minPrice?: number;
  maxPrice?: number;
  brands?:   string;   // legacy brand-name filter (kept for backward compat)
  sort?:     string;   // 'newest' | 'top_sales' | 'popular' | 'price_asc' | 'price_desc'
}

export const getPublicProducts = async ({ category, brandId, search, onSale, page = 1, limit = 12, minPrice, maxPrice, brands, sort }: PublicProductQuery) => {
  const parsedPage  = Math.max(Number(page) || 1, 1);
  const parsedLimit = Math.max(Number(limit) || 12, 1);
  const skip = (parsedPage - 1) * parsedLimit;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = { isActive: true };

  if (search) query.name = { $regex: search.trim(), $options: "i" };

  if (onSale === "true") {
    const saleVariants = await Variant.find({ discountPrice: { $gt: 0 } }, { productId: 1 }).lean();
    const saleProductIds = [...new Set(saleVariants.map((v: any) => v.productId.toString()))];
    query._id = { $in: saleProductIds };
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    const variantQuery: any = {};
    if (minPrice !== undefined) variantQuery.$gte = Number(minPrice);
    if (maxPrice !== undefined) variantQuery.$lte = Number(maxPrice);
    const variantsInRange = await Variant.find({ price: variantQuery }, { productId: 1 });
    const productIds = variantsInRange.map((v) => v.productId);
    query._id = { $in: productIds };
  }

  const queryWithoutCategories = { ...query };

  if (category) {
    const categorySlugs = category.split(',').map(s => s.trim()).filter(Boolean);
    const categoryIds = [];
    for (const slug of categorySlugs) {
      const ids = await productRepo.findCategoryIdsWithDescendants(slug);
      categoryIds.push(...ids);
    }
    if (categoryIds.length === 0) return { products: [], pagination: { page: parsedPage, limit: parsedLimit, total: 0, totalPages: 0 }, availableBrands: [], availableCategoryIds: [] };
    query.$or = [
      { categoryId:  { $in: categoryIds } },
      { categoryIds: { $in: categoryIds } },
    ];
    delete query.categoryId;
  }

  const queryWithoutBrands = { ...query };

  if (brandId) {
    const brandIds = brandId.split(',').map(b => b.trim()).filter(Boolean);
    if (brandIds.length > 0) {
      query.brandId = { $in: brandIds.map(id => new mongoose.Types.ObjectId(id)) };
    }
  } else if (brands) {
    const brandArr = brands.split(',').map(b => b.trim()).filter(Boolean);
    if (brandArr.length > 0) {
      query.brand = { $in: brandArr.map(b => new RegExp('^' + b + '$', 'i')) };
    }
  }

  // ── Sort logic ──────────────────────────────────────────────────────────────
  const isPrice = sort === 'price_asc' || sort === 'price_desc';

  // Map sort string → MongoDB sort object for simple field sorts
  const sortMap: Record<string, Record<string, any>> = {
    newest:    { createdAt: -1 },
    top_sales: { soldCount: -1, createdAt: -1 },
    popular:   { soldCount: -1, numReviews: -1, createdAt: -1 },
  };
  const mongoSort = sortMap[sort ?? 'newest'] ?? { createdAt: -1 };

  try {
    // Parallel metadata queries (brands + categories in products)
    const [availableBrands, availableCategoryIds] = await Promise.all([
      productRepo.findBrandsInProducts(queryWithoutBrands).catch((e: any) => { console.error('[findBrands]', e.message); return []; }),
      productRepo.findCategoriesInProducts(queryWithoutCategories).catch((e: any) => { console.error('[findCats]', e.message); return []; }),
    ]);

    // ── Price sort: aggregate variant min prices ───────────────────────────
    if (isPrice) {
      const priceOrder = sort === 'price_asc' ? 1 : -1;

      // Get ALL matching product IDs
      const matchingDocs = await mongoose.model('Product').find(query).select('_id').lean();
      const matchingIds  = matchingDocs.map((d: any) => d._id);

      // Sort by min variant price
      const priceSorted = await Variant.aggregate([
        { $match: { productId: { $in: matchingIds } } },
        { $group: { _id: '$productId', minPrice: { $min: '$price' } } },
        { $sort:  { minPrice: priceOrder } },
      ]);

      const total     = priceSorted.length;
      const pagedIds  = priceSorted.slice(skip, skip + parsedLimit).map((r: any) => r._id);
      const products  = await productRepo.findPublicByIds(pagedIds);

      return {
        products: products.map(mapProduct),
        availableBrands,
        availableCategoryIds,
        pagination: { page: parsedPage, limit: parsedLimit, total, totalPages: Math.ceil(total / parsedLimit) },
      };
    }

    // ── Standard sort (newest / top_sales / popular) ───────────────────────
    const [products, total] = await Promise.all([
      productRepo.findPublic(query, skip, parsedLimit, mongoSort),
      productRepo.countAll(query),
    ]);

    return {
      products: products.map(mapProduct),
      availableBrands,
      availableCategoryIds,
      pagination: { page: parsedPage, limit: parsedLimit, total, totalPages: Math.ceil(total / parsedLimit) },
    };
  } catch (error: any) {
    console.error("[getPublicProducts] Fatal error:", error?.message, error?.stack?.slice(0, 300));
    throw error;
  }
};

export const getPublicProductDetail = async (slugOrId: string) => {
  // Hỗ trợ cả slug lẫn MongoDB ObjectId (backward compat với cart items cũ)
  let product = null;
  if (mongoose.Types.ObjectId.isValid(slugOrId)) {
    product = await productRepo.findById(slugOrId);
  }
  if (!product) {
    product = await productRepo.findBySlug(slugOrId);
  }
  if (!product) throw notFound("Không tìm thấy sản phẩm");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((product.categoryId as any)?.isActive === false) throw notFound("Không tìm thấy sản phẩm do danh mục đã ngừng hoạt động");
  return mapProduct(product);
};

export const getRecommendedProducts = async (productId: string, limit: number = 10) => {
  if (!mongoose.Types.ObjectId.isValid(productId)) throw badRequest("ID sản phẩm không hợp lệ");
  const pId = new mongoose.Types.ObjectId(productId);

  const product = await productRepo.findById(productId);
  if (!product) throw notFound("Không tìm thấy sản phẩm");

  const { default: Order } = await import("../../models/order.schema.js");

  // 1. Collaborative Filtering: "Customers who bought this also bought"
  const orders = await Order.find({ "items.productId": pId }).select("items.productId").lean();
  
  const frequencyMap: Record<string, number> = {};
  for (const order of orders) {
    for (const item of order.items) {
      const idStr = item.productId.toString();
      if (idStr !== productId) {
        frequencyMap[idStr] = (frequencyMap[idStr] || 0) + 1;
      }
    }
  }

  // Sort by frequency
  const sortedIds = Object.entries(frequencyMap)
    .sort(([, countA], [, countB]) => countB - countA)
    .map(([id]) => new mongoose.Types.ObjectId(id))
    .slice(0, limit);

  const recommendedProducts: any[] = [];
  
  if (sortedIds.length > 0) {
    const collabProducts = await productRepo.findPublic({ _id: { $in: sortedIds }, isActive: true }, 0, limit);
    // Keep sorting order
    const collabMap = new Map(collabProducts.map((p) => [p._id.toString(), p]));
    for (const id of sortedIds) {
      if (collabMap.has(id.toString())) {
        recommendedProducts.push(collabMap.get(id.toString()));
      }
    }
  }

  // 2. Content-Based Fallback
  const remainingSlots = limit - recommendedProducts.length;
  if (remainingSlots > 0) {
    const existingIds = recommendedProducts.map((p) => p._id);
    existingIds.push(pId); // exclude current product

    const fallbackProducts = await productRepo.findPublic(
      { 
        categoryId: product.categoryId, 
        _id: { $nin: existingIds },
        isActive: true
      }, 
      0, 
      remainingSlots
    );
    
    // Sort fallback by reviews/rating in memory to show the best related products
    fallbackProducts.sort((a, b) => (b.numReviews || 0) - (a.numReviews || 0));
    
    recommendedProducts.push(...fallbackProducts);
  }

  return recommendedProducts.map(mapProduct);
};

// ── ADMIN ─────────────────────────────────────────────────────────────────────

interface AdminProductQuery { search?: string; category?: string; brandId?: string; status?: string; page?: number; limit?: number; shopId?: string | null; }

export const getAdminProducts = async ({ search, category, brandId, status, page = 1, limit = 20, shopId }: AdminProductQuery) => {
  const parsedPage  = Math.max(Number(page) || 1, 1);
  const parsedLimit = Math.max(Number(limit) || 20, 1);
  const skip = (parsedPage - 1) * parsedLimit;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {};
  
  if (shopId !== undefined) {
    query.shopId = shopId ? new mongoose.Types.ObjectId(shopId) : null;
  }

  if (search) query.name = { $regex: search.trim(), $options: "i" };
  if (status === "active") query.isActive = true;
  else if (status === "inactive") query.isActive = false;

  if (brandId) {
    query.brandId = new mongoose.Types.ObjectId(brandId);
  }

  if (category) {
    const categoryIds = await productRepo.findCategoryIdsWithDescendants(category);
    if (categoryIds.length === 0) return { products: [], pagination: { page: parsedPage, limit: parsedLimit, total: 0, totalPages: 0 } };
    query.$or = [
      { categoryId:  { $in: categoryIds } },
      { categoryIds: { $in: categoryIds } },
    ];
  }

  const [products, total] = await Promise.all([
    productRepo.findAdmin(query, skip, parsedLimit),
    productRepo.countAll(query),
  ]);

  return {
    products: products.map(mapProduct),
    pagination: { page: parsedPage, limit: parsedLimit, total, totalPages: Math.ceil(total / parsedLimit) },
  };
};

export const getAdminProductDetail = async (id: string, shopId?: string | null) => {
  const query: any = { _id: id };
  if (shopId !== undefined) {
    query.shopId = shopId ? new mongoose.Types.ObjectId(shopId) : null;
  }
  const product = await productRepo.findOneBy(query);
  if (!product) throw notFound("Không tìm thấy sản phẩm");
  return mapProduct(product);
};

export const createProduct = async (data: CreateProductInput) => {
  const category = await productRepo.findCategoryById(data.categoryId);
  if (!category) throw badRequest("Danh mục không tồn tại");

  const { default: Brand } = await import("../../models/brand.schema.js");
  const brandDoc = await Brand.findById(data.brandId);
  if (!brandDoc) throw badRequest("Thương hiệu không tồn tại");

  // Validate secondary categories if provided
  if (data.categoryIds && data.categoryIds.length > 0) {
    const validCategories = await Promise.all(
      data.categoryIds.map(id => productRepo.findCategoryById(id))
    );
    if (validCategories.some(c => !c)) throw badRequest("Một hoặc nhiều danh mục phụ không tồn tại");
  }

  const slug = slugify(data.name);
  const existing = await productRepo.findOneBy({ slug, categoryId: data.categoryId });
  if (existing) throw conflict("Slug sản phẩm đã tồn tại trong danh mục này");

  const newProduct = await productRepo.create({
    ...data,
    slug,
    description: sanitizeRichText(data.description ?? ""),  // XSS protection
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    categoryId:  data.categoryId as any,
    categoryIds: (data.categoryIds ?? []) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    brandId: data.brandId as any,
  });

  if (data.variants && data.variants.length > 0) {
    const variantsToCreate = data.variants.map((v, idx) => ({
      ...v,
      productId: newProduct._id,
      sku: v.sku?.trim() || `SKU-${slugify(brandDoc.name).slice(0, 3).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}-${idx}`,
    }));
    await Variant.insertMany(variantsToCreate);
  }

  const created = await productRepo.findById(newProduct._id.toString());
  return mapProduct(created!);
};

export const updateProduct = async (id: string, data: UpdateProductInput) => {
  const query: any = { _id: id };
  
  const product = await productRepo.findOneBy(query);
  if (!product) throw notFound("Không tìm thấy sản phẩm hoặc bạn không có quyền cập nhật");

  let nextCategoryId = product.categoryId;

  if (data.categoryId !== undefined) {
    const category = await productRepo.findCategoryById(data.categoryId);
    if (!category) throw badRequest("Danh mục không tồn tại");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    product.categoryId = data.categoryId as any;
    nextCategoryId = data.categoryId as any;
  }

  // Update secondary categories (N:M assignments)
  if (data.categoryIds !== undefined) {
    if (data.categoryIds.length > 0) {
      const validCategories = await Promise.all(
        data.categoryIds.map(cid => productRepo.findCategoryById(cid))
      );
      if (validCategories.some(c => !c)) throw badRequest("Một hoặc nhiều danh mục phụ không tồn tại");
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (product as any).categoryIds = data.categoryIds as any;
  }

  if (data.name !== undefined) {
    const nextSlug = slugify(data.name);
    const existing = await productRepo.findOneBy({ slug: nextSlug, categoryId: nextCategoryId, _id: { $ne: product._id } });
    if (existing) throw conflict("Slug sản phẩm đã tồn tại trong danh mục này");
    product.name = data.name;
    product.slug = nextSlug;
  }

  if (data.brandId !== undefined) {
    const { default: Brand } = await import("../../models/brand.schema.js");
    const brandDoc = await Brand.findById(data.brandId);
    if (!brandDoc) throw badRequest("Thương hiệu không tồn tại");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    product.brandId = data.brandId as any;
  }

  if (data.description  !== undefined) product.description = sanitizeRichText(data.description);  // XSS protection
  if (data.imageUrl     !== undefined) product.imageUrl    = data.imageUrl;
  if (data.imageUrls    !== undefined) product.imageUrls   = data.imageUrls as any;
  if (data.isActive     !== undefined) product.isActive    = data.isActive;

  await productRepo.save(product);

  if (data.variants && data.variants.length > 0) {
    await Variant.deleteMany({ productId: product._id });
    const { default: Brand } = await import("../../models/brand.schema.js");
    const brandDoc = await Brand.findById(product.brandId);
    const variantsToCreate = data.variants.map((v, idx) => ({
      ...v,
      productId: product._id,
      sku: v.sku?.trim() || `SKU-${slugify(brandDoc?.name || "SP").slice(0, 3).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}-${idx}`,
    }));
    await Variant.insertMany(variantsToCreate);
  }

  const updated = await productRepo.findById(product._id.toString());
  return mapProduct(updated!);
};

export const updateProductStatus = async (id: string, isActive: boolean, shopId?: string | null) => {
  const query: any = { _id: id };
  if (shopId !== undefined) {
    query.shopId = shopId ? new mongoose.Types.ObjectId(shopId) : null;
  }
  const product = await productRepo.findOneBy(query);
  if (!product) throw notFound("Không tìm thấy sản phẩm hoặc bạn không có quyền cập nhật");
  product.isActive = isActive;
  await productRepo.save(product);
  const updated = await productRepo.findById(product._id.toString());
  return mapProduct(updated!);
};

export const deleteProduct = async (id: string, shopId?: string | null) => {
  const query: any = { _id: id };
  if (shopId !== undefined) {
    query.shopId = shopId ? new mongoose.Types.ObjectId(shopId) : null;
  }
  const product = await productRepo.findOneBy(query);
  if (!product) throw notFound("Không tìm thấy sản phẩm hoặc bạn không có quyền xóa");
  
  await productRepo.findByIdAndDelete(id);
  
  const { default: Variant } = await import("../../models/variant.schema.js");
  await Variant.deleteMany({ productId: id });
};
