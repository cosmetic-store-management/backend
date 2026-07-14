import { injectable, inject } from "tsyringe";
import { ProductRepository } from "./product.repository.js";
import mongoose from "mongoose";
import NodeCache from "node-cache";

const metadataCache = new NodeCache({ stdTTL: 3600, checkperiod: 600, useClones: false });

import { BrandRepository } from "../brand/brand.repository.js";
import { OrderService } from "../../sales/order/order.service.js";
import { UserService } from "../../identity/user/user.service.js";
import { InventoryRepository } from "../inventory/inventory.repository.js";
import { mapProduct } from "./dto/product.response.dto.js";
import {
  badRequest,
  notFound,
  conflict,
} from "../../../shared/errors/httpErrors.js";
import { eventBus } from "../../shared/event-bus/index.js";
import { sanitizeRichText } from "../../../shared/helpers/sanitize.js";
import type {
  CreateProductInput,
  UpdateProductInput,
} from "./dto/product.request.dto.js";

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

// ── PUBLIC ────────────────────────────────────────────────────────────────────

interface PublicProductQuery {
  category?: string;
  brandId?: string; // filter by brandId (source of truth)
  search?: string;
  onSale?: string;
  page?: number;
  limit?: number;
  minPrice?: number;
  maxPrice?: number;
  brands?: string; // legacy brand-name filter (kept for backward compat)
  sort?: string; // 'newest' | 'top_sales' | 'popular' | 'price_asc' | 'price_desc'
}

interface AdminProductQuery {
  search?: string;
  category?: string;
  brandId?: string;
  status?: string;
  minStock?: number;
  maxStock?: number;
  cursor?: string;
  limit?: number;
  page?: number;
}
@injectable()
export class ProductService {
  constructor(
    @inject(ProductRepository) private readonly productRepo: ProductRepository,
    @inject(BrandRepository) private readonly brandRepo: BrandRepository,
    @inject(OrderService) private readonly orderService: OrderService,
    @inject(UserService) private readonly userService: UserService,
    @inject(InventoryRepository) private readonly inventoryRepo: InventoryRepository
  ) {
    eventBus.on("product.soldCount.decremented", async (payload: { productId: string; quantity: number; session?: mongoose.ClientSession }) => {
      try {
        await this.productRepo.updateById(
          payload.productId,
          { $inc: { soldCount: -Math.abs(payload.quantity) } } as any
        );
      } catch (err) {
        console.error("Error in product.soldCount.decremented:", err);
      }
    });

    eventBus.on("product.soldCount.incremented", async (payload: { productId: string; quantity: number; session?: mongoose.ClientSession }) => {
      try {
        await this.productRepo.updateById(
          payload.productId,
          { $inc: { soldCount: Math.abs(payload.quantity) } } as any
        );
      } catch (err) {
        console.error("Error in product.soldCount.incremented:", err);
      }
    });

    eventBus.on("product.rating.updated", async (payload: { productId: string; averageRating: number; numReviews: number; session?: mongoose.ClientSession }) => {
      try {
        await this.productRepo.updateById(
          payload.productId,
          { 
            averageRating: payload.averageRating, 
            numReviews: payload.numReviews 
          }
        );
      } catch (err) {
        console.error("Error in product.rating.updated:", err);
      }
    });
  }

  invalidatePublicCache = () => {
    const keys = metadataCache.keys();
    keys.forEach((key) => {
      if (key.startsWith("public_products:")) {
        metadataCache.del(key);
      }
    });
  };

  getPublicProducts = async (params: PublicProductQuery) => {
    const cacheKey = "public_products:" + JSON.stringify(params);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hit = metadataCache.get<any>(cacheKey);
    if (hit) return hit;

    const result = await this._getPublicProductsRaw(params);
    metadataCache.set(cacheKey, result);
    return result;
  };

  private _getPublicProductsRaw = async ({
  category,
  brandId,
  search,
  onSale,
  page = 1,
  limit = 12,
  minPrice,
  maxPrice,
  brands,
  sort,
}: PublicProductQuery) => {
  const parsedPage = Math.max(Number(page) || 1, 1);
  const parsedLimit = Math.max(Number(limit) || 12, 1);
  const skip = (parsedPage - 1) * parsedLimit;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = { isActive: true };

  if (search) query.$text = { $search: search.trim() };

  if (onSale === "true") {
    const saleProductIds = await this.productRepo.findSaleProductIds();
    query._id = { $in: saleProductIds };
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    const minP = minPrice !== undefined ? Number(minPrice) : 0;
    const maxP =
      maxPrice !== undefined ? Number(maxPrice) : Number.MAX_SAFE_INTEGER;

    // OPTIMIZATION: Filter directly on Product collection instead of aggregating Variants
    // This uses the minPrice/maxPrice fields that are kept in sync by syncProductPrices
    query.minPrice = { $lte: maxP };
    query.maxPrice = { $gte: minP };
  }

  const queryWithoutCategories = { ...query };

  if (category) {
    const categorySlugs = category
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    
    const nestedIds = await Promise.all(
      categorySlugs.map((slug) =>
        this.productRepo.findCategoryIdsWithDescendants(slug)
      )
    );
    const categoryIds = nestedIds.flat();
    if (categoryIds.length === 0)
      return {
        products: [],
        pagination: {
          page: parsedPage,
          limit: parsedLimit,
          total: 0,
          totalPages: 0,
        },
        availableBrands: [],
        availableCategoryIds: [],
      };
    query.$or = [
      { categoryId: { $in: categoryIds } },
      { categoryIds: { $in: categoryIds } },
    ];
    delete query.categoryId;
  }

  const queryWithoutBrands = { ...query };

  if (brandId) {
    const brandIds = brandId
      .split(",")
      .map((b) => b.trim())
      .filter(Boolean);
    if (brandIds.length > 0) {
      query.brandId = {
        $in: brandIds.map((id) => new mongoose.Types.ObjectId(id)),
      };
    }
  } else if (brands) {
    const brandArr = brands
      .split(",")
      .map((b) => b.trim())
      .filter(Boolean);
    if (brandArr.length > 0) {
      const matchedBrandIds = await this.brandRepo.findIdsBySlugs(brandArr);
      
      if (matchedBrandIds.length > 0) {
        query.brandId = { $in: matchedBrandIds };
      } else {
        // If slugs are provided but none exist, return no products
        query.brandId = null;
      }
    }
  }

  // ── Sort logic ──────────────────────────────────────────────────────────────
  const isPrice = sort === "price_asc" || sort === "price_desc";

  // Map sort string → MongoDB sort object for simple field sorts
  const sortMap: Record<string, Record<string, any>> = {
    newest: { createdAt: -1 },
    top_sales: { soldCount: -1, createdAt: -1 },
    popular: { soldCount: -1, numReviews: -1, createdAt: -1 },
    price_asc: { minPrice: 1, _id: 1 },
    price_desc: { minPrice: -1, _id: 1 },
  };
  const mongoSort = sortMap[sort ?? "newest"] ?? { createdAt: -1 };

  try {
    // ── Cache for Metadata Aggregations ──────────────────────────────────────────
    // Key: query hash, Value: { brands, categories }
    const metadataCacheKey = JSON.stringify(queryWithoutBrands) + "|" + JSON.stringify(queryWithoutCategories);

    let availableBrands: any[] = [];
    let availableCategoryIds: string[] = [];

    const cachedMeta = metadataCache.get<{brands: any[], categories: string[]}>(metadataCacheKey);
    if (cachedMeta) {
      availableBrands = cachedMeta.brands;
      availableCategoryIds = cachedMeta.categories;
    } else {
      try {
        // Parallel metadata queries (brands + categories in products)
        const [fetchedBrands, fetchedCats] = await Promise.all([
          this.productRepo.findBrandsInProducts(queryWithoutBrands).catch((e: any) => {
            console.error("[findBrands]", e.message);
            return [];
          }),
          this.productRepo
            .findCategoriesInProducts(queryWithoutCategories)
            .catch((e: any) => {
              console.error("[findCats]", e.message);
              return [];
            }),
        ]);
        availableBrands = fetchedBrands;
        availableCategoryIds = fetchedCats;
        // Cache for 60 seconds (handled by NodeCache stdTTL)
        metadataCache.set(metadataCacheKey, {
          brands: availableBrands,
          categories: availableCategoryIds,
        });
      } catch (e: any) {
        console.error("Metadata fetch error:", e.message);
      }
    }

    // ── Standard sort (newest / top_sales / popular / price) ───────────────────────
    const [products, total] = await Promise.all([
      this.productRepo.findPublic(query, skip, parsedLimit, mongoSort),
      this.productRepo.countAll(query),
    ]);

    return {
      products: products.map(mapProduct),
      availableBrands,
      availableCategoryIds,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        totalPages: Math.ceil(total / parsedLimit),
      },
    };
  } catch (error: any) {
    console.error(
      "[getPublicProducts] Fatal error:",
      error?.message,
      error?.stack?.slice(0, 300),
    );
    throw error;
  }
};

  getPublicProductDetail = async (slugOrId: string) => {
  // Hỗ trợ cả slug lẫn MongoDB ObjectId (backward compat với cart items cũ)
  let product = null;
  if (mongoose.Types.ObjectId.isValid(slugOrId)) {
    product = await this.productRepo.findById(slugOrId);
  }
  if (!product) {
    product = await this.productRepo.findBySlug(slugOrId);
  }
  if (!product) throw notFound("Product not found");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((product.categoryId as any)?.isActive === false)
    throw notFound("Product not found because its category is inactive");
  return mapProduct(product);
};

  getRecommendedProducts = async (
  productId: string,
  limit: number = 10,
) => {
  if (!mongoose.Types.ObjectId.isValid(productId))
    throw badRequest("Invalid product ID");

  const cacheKey = `recommendation:${productId}:${limit}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hit = metadataCache.get<any>(cacheKey);
  if (hit) return hit;

  const pId = new mongoose.Types.ObjectId(productId);

  const product = await this.productRepo.findById(productId);
  if (!product) throw notFound("Product not found");

  const sortedIds = await this.orderService.getCollaborativeProductIds(productId, limit);

  const recommendedProducts: any[] = [];

  if (sortedIds.length > 0) {
    const collabProducts = await this.productRepo.findPublic(
      { _id: { $in: sortedIds }, isActive: true },
      0,
      limit,
    );
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

    const fallbackProducts = await this.productRepo.findPublic(
      {
        categoryId: product.categoryId,
        _id: { $nin: existingIds },
        isActive: true,
      },
      0,
      remainingSlots,
    );

    // Sort fallback by reviews/rating in memory to show the best related products
    fallbackProducts.sort((a: any, b: any) => (b.numReviews || 0) - (a.numReviews || 0));

    recommendedProducts.push(...fallbackProducts);
  }

  const result = recommendedProducts.map(mapProduct);
  metadataCache.set(cacheKey, result);
  return result;
};

// ── ADMIN ─────────────────────────────────────────────────────────────────────



  getAdminProducts = async ({
  search,
  category,
  brandId,
  status,
  minStock,
  maxStock,
  cursor,
  limit = 20,
  page,
}: AdminProductQuery) => {
  const parsedLimit = Math.max(Number(limit) || 20, 1);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {};

  if (search) {
    const cleanSearch = search.trim();
    const variantProductIds = await this.productRepo.findProductIdsByVariantSearch(cleanSearch);

    query.$or = [
      { $text: { $search: cleanSearch } },
      { _id: { $in: variantProductIds } },
    ];
  }
  if (status === "active") query.isActive = true;
  else if (status === "inactive") query.isActive = false;

  if (minStock !== undefined || maxStock !== undefined) {
    const productIds = await this.productRepo.findProductIdsByVariantStock(minStock, maxStock);

    if (query._id) {
      // If _id is already filtered (unlikely in this query, but safe)
      query._id = { ...query._id, $in: productIds };
    } else {
      query._id = { $in: productIds };
    }
  }

  if (brandId) {
    query.brandId = new mongoose.Types.ObjectId(brandId);
  }

  if (category) {
    const categoryIds =
      await this.productRepo.findCategoryIdsWithDescendants(category);
    if (categoryIds.length === 0)
      return {
        products: [],
        pagination: {
          limit: parsedLimit,
          total: 0,
          page: 1,
          totalPages: 1,
        },
      };
    query.$or = [
      { categoryId: { $in: categoryIds } },
      { categoryIds: { $in: categoryIds } },
    ];
  }

  const [result, total] = await Promise.all([
    this.productRepo.findAdmin(query, cursor || null, parsedLimit, page ? Number(page) : undefined),
    this.productRepo.countAll(query),
  ]);

  return {
    products: result.products.map(mapProduct),
    pagination: {
      limit: parsedLimit,
      total,
      page: page ? Number(page) : 1,
      totalPages: Math.ceil(total / parsedLimit),
    },
  };
};

  getAdminProductDetail = async (
  id: string,
) => {
  const product = await this.productRepo.findById(id);
  if (!product) throw notFound("Product not found");
  return mapProduct(product as any);
};

  createProduct = async (data: CreateProductInput) => {
  const category = await this.productRepo.findCategoryById(data.categoryId);
  if (!category) throw badRequest("Category does not exist");

  const brandDoc = await this.brandRepo.findById(data.brandId);
  if (!brandDoc) throw badRequest("Brand does not exist");

  // Validate secondary categories if provided
  if (data.categoryIds && data.categoryIds.length > 0) {
    const validCategories = await Promise.all(
      data.categoryIds.map((id) => this.productRepo.findCategoryById(id)),
    );
    if (validCategories.some((c) => !c))
      throw badRequest("One or more subcategories do not exist");
  }

  const slug = slugify(data.name);
  const existing = await this.productRepo.findOneBy({
    slug,
    categoryId: data.categoryId,
  });
  if (existing) throw conflict("Product slug already exists in this category");

  const newProduct = await this.productRepo.create({
    ...data,
    slug,
    description: sanitizeRichText(data.description ?? ""), // XSS protection
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    categoryId: data.categoryId as any,
    categoryIds: (data.categoryIds ?? []) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    brandId: data.brandId as any,
  });

  if (data.variants && data.variants.length > 0) {
    const variantsToCreate = data.variants.map((v, idx) => ({
      ...v,
      productId: newProduct._id,
      sku:
        v.sku?.trim() ||
        `SKU-${slugify(brandDoc.name).slice(0, 3).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}-${idx}`,
    }));
    const insertedVariants = await this.productRepo.createVariants(variantsToCreate);

    // ── Opening Balance Sync ──────────────────────────────────────────────
    // For each variant with initial stock > 0, create an opening balance
    // Batch (TONDAU) and a corresponding InventoryTransaction so FEFO and
    // Moving Average Cost calculations have a valid starting point.
    for (let idx = 0; idx < insertedVariants.length; idx++) {
      const insertedVariant = insertedVariants[idx];
      const sourceVariant = data.variants[idx];
      const initialStock = Number(sourceVariant.stock ?? 0);
      if (initialStock <= 0) continue;

      const estimatedPrice = Number(sourceVariant.price ?? 0) * 0.6;
      await this.inventoryRepo.createBatch({
        variantId: insertedVariant._id,
        goodsReceiptId: null,
        batchCode: "TONDAU",
        importPrice: estimatedPrice,
        originalQty: initialStock,
        remainingQty: initialStock,
      });

      const txCode = `TXIN-OB-${insertedVariant._id.toString().slice(-6).toUpperCase()}-${Date.now()}`;
      // Resolve a creatorId: prefer owner/manager, fallback to any user
      let systemUser: any = await this.userService.getUserByRole("owner");
      if (!systemUser) systemUser = await this.userService.getUserByRole("manager");
      
      if (systemUser) {
        await this.inventoryRepo.createTransaction({
          code: txCode,
          productId: newProduct._id,
          variantId: insertedVariant._id,
          type: "in",
          qty: initialStock,
          price: estimatedPrice,
          creatorId: systemUser._id,
          date: new Date(),
        });
      }
    }
  }

  const created = await this.productRepo.findById(newProduct._id.toString());
  this.invalidatePublicCache();
  await this.syncProductPrices(newProduct._id);
  return mapProduct(created!);
};

  updateProduct = async (id: string, data: UpdateProductInput) => {
  const product = await this.productRepo.findDocumentById(id);
  if (!product)
    throw notFound("Product not found or you do not have permission to update");

  let nextCategoryId = product.categoryId;

  if (data.categoryId !== undefined) {
    const category = await this.productRepo.findCategoryById(data.categoryId);
    if (!category) throw badRequest("Category does not exist");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    product.categoryId = data.categoryId as any;
    nextCategoryId = data.categoryId as any;
  }

  // Update secondary categories (N:M assignments)
  if (data.categoryIds !== undefined) {
    if (data.categoryIds.length > 0) {
      const validCategories = await Promise.all(
        data.categoryIds.map((cid) => this.productRepo.findCategoryById(cid)),
      );
      if (validCategories.some((c) => !c))
        throw badRequest("One or more subcategories do not exist");
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (product as any).categoryIds = data.categoryIds as any;
  }

  if (data.name !== undefined) {
    const nextSlug = slugify(data.name);
    const existing = await this.productRepo.findOneBy({
      slug: nextSlug,
      categoryId: nextCategoryId,
      _id: { $ne: product._id },
    });
    if (existing) throw conflict("Product slug already exists in this category");
    product.name = data.name;
    product.slug = nextSlug;
  }

  if (data.brandId !== undefined) {
    const brandDoc = await this.brandRepo.findById(data.brandId.toString());
    if (!brandDoc) throw badRequest("Brand does not exist");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    product.brandId = data.brandId as any;
  }

  if (data.description !== undefined)
    product.description = sanitizeRichText(data.description); // XSS protection
  if (data.imageUrl !== undefined) product.imageUrl = data.imageUrl;
  if (data.imageUrls !== undefined) product.imageUrls = data.imageUrls as any;
  if (data.isActive !== undefined) product.isActive = data.isActive;

  await this.productRepo.save(product);

  if (data.variants && data.variants.length > 0) {
    const brandDoc = await this.brandRepo.findById(product.brandId.toString());

    const variantIdsToKeep = data.variants
      .filter((v: any) => v.id)
      .map((v: any) => v.id);
    await this.productRepo.deleteVariantsExcept(product._id.toString(), variantIdsToKeep);

    for (let idx = 0; idx < data.variants.length; idx++) {
      const v: any = data.variants[idx];
      const skuToUse =
        v.sku?.trim() ||
        `SKU-${slugify(brandDoc?.name || "SP")
          .slice(0, 3)
          .toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}-${idx}`;

      const variantPayload = { ...v, sku: skuToUse };
      delete variantPayload.id;

      if (v.id) {
        await this.productRepo.updateVariant(v.id, variantPayload);
      } else {
        // New variant added during product update — sync opening balance
        const newVariant = await this.productRepo.createVariant({ ...variantPayload, productId: product._id });
        const initialStock = Number(v.stock ?? 0);
        if (initialStock > 0) {
          const estimatedPrice = Number(v.price ?? 0) * 0.6;
          await this.inventoryRepo.createBatch({
            variantId: newVariant._id,
            goodsReceiptId: null,
            batchCode: "TONDAU",
            importPrice: estimatedPrice,
            originalQty: initialStock,
            remainingQty: initialStock,
          });
          const txCode = `TXIN-OB-${newVariant._id.toString().slice(-6).toUpperCase()}-${Date.now()}`;
          let systemUser: any = await this.userService.getUserByRole("owner");
          if (!systemUser) systemUser = await this.userService.getUserByRole("manager");
          
          if (systemUser) {
            await this.inventoryRepo.createTransaction({
              code: txCode,
              productId: product._id,
              variantId: newVariant._id,
              type: "in",
              qty: initialStock,
              price: estimatedPrice,
              creatorId: systemUser._id,
              date: new Date(),
            });
          }
        }
      }
    }
  }

  const updated = await this.productRepo.findById(product._id.toString());
  this.invalidatePublicCache();
  return mapProduct(updated!);
};

  updateProductStatus = async (
  id: string,
  isActive: boolean,
) => {
  const query: any = { _id: id };
  const product = await this.productRepo.findDocumentBy(query);
  if (!product)
    throw notFound("Product not found or you do not have permission to update");
  product.isActive = isActive;
  await this.productRepo.save(product);
  const updated = await this.productRepo.findById(product._id.toString());
  this.invalidatePublicCache();
  return mapProduct(updated!);
};

  deleteProduct = async (id: string) => {
  const query: any = { _id: id };
  const product = await this.productRepo.findOneBy(query);
  if (!product)
    throw notFound("Không tìm thấy sản phẩm hoặc bạn không có quyền xóa");

  // ── Delete Guard ──────────────────────────────────────────────────────
  // Block hard-delete if the product has active inventory batches or
  // goods receipts. Use Discontinue (isActive = false) instead.
  const variantIds = await this.productRepo.findVariantIdsByProductId(id);
  if (variantIds.length > 0) {
    const activeBatchCount = await this.inventoryRepo.countActiveBatches(variantIds);
    if (activeBatchCount > 0) {
      throw conflict(
        `Cannot delete this product — it has ${activeBatchCount} active inventory batch(es) with remaining stock. Use "Discontinue" (set inactive) instead.`,
      );
    }

    const txCount = await this.inventoryRepo.countTransactionsForVariants(variantIds);
    if (txCount > 0) {
      throw conflict(
        `Cannot delete this product — it has ${txCount} inventory transaction record(s). Use "Discontinue" (set inactive) to preserve audit history.`,
      );
    }
  }

  await this.productRepo.findByIdAndDelete(id);
  await this.productRepo.deleteVariantsByProductId(id);

  // TODO: Use event bus to trigger review deletion via ReviewService instead of direct schema dependency
  // await eventBus.emitAsync("product.deleted", { productId: id });
  this.invalidatePublicCache();
};

  batchImportProducts = async (productsData: any[]) => {
  let totalProcessed = 0;

  const productGroups = new Map<string, any[]>();
  for (const row of productsData) {
    const pName = row["Product Name"] || row["Product name"];
    const slug = row["Slug"] || (pName ? slugify(pName) : "");
    if (!slug) continue;
    if (!productGroups.has(slug)) {
      productGroups.set(slug, []);
    }
    productGroups.get(slug)!.push(row);
  }

  for (const [slug, rows] of productGroups.entries()) {
    const firstRow = rows[0];

    let brandId: mongoose.Types.ObjectId | undefined;
    const brandName = firstRow["Brand"];
    if (brandName) {
      let brand: any = await this.brandRepo.findOneBy({ name: new RegExp(`^${brandName}$`, 'i') });
      if (!brand) {
        brand = await this.brandRepo.create({ name: brandName, slug: slugify(brandName) });
      }
      brandId = brand._id;
    }

    let categoryId: mongoose.Types.ObjectId | undefined;
    const categoryName = firstRow["Category"];
    if (categoryName) {
      let cat: any = await this.productRepo.findOneCategoryBy({ name: new RegExp(`^${categoryName}$`, 'i') });
      if (!cat) {
        cat = await this.productRepo.createCategory({ name: categoryName, slug: slugify(categoryName) });
      }
      categoryId = cat._id;
    }

    const pStatusRaw = firstRow["Product Status"] || firstRow["Trạng thái"];
    const isProductActive = pStatusRaw === "Active" || pStatusRaw === "Đang bán" || pStatusRaw === true || pStatusRaw === "true";

    const productData = {
      name: firstRow["Product Name"] || firstRow["Product name"],
      slug: slug,
      brandId: brandId,
      categoryId: categoryId,
      description: firstRow["Description"] || firstRow["Mô tả"] || "",
      isActive: isProductActive,
    };

    if (!productData.name || !brandId || !categoryId) {
      continue;
    }

    let product = await this.productRepo.findDocumentBy({ slug });
    if (product) {
      await this.productRepo.updateById(product._id.toString(), productData);
    } else {
      product = await this.productRepo.create(productData);
    }

    const variantIds = await this.productRepo.findVariantIdsByProductId(product._id.toString());
    const existingVariants = await Promise.all(variantIds.map(id => this.productRepo.findVariantById(id)));
    const existingVariantsMap = new Map(
      existingVariants.filter(Boolean).map((v: any) => [v.barcode || v.sku || v.name, v])
    );

    for (const row of rows) {
      const vName = row["Variant Name"] || row["Tên biến thể"] || "Default";
      const barcode = row["Barcode"] || row["SKU"] || "";
      const vKey = barcode || vName;

      const vStatusRaw = row["Variant Status"] || row["Trạng thái (Biến thể)"];
      const isVariantActive = vStatusRaw !== "Inactive" && vStatusRaw !== "Discontinued" && vStatusRaw !== false && vStatusRaw !== "false";

      const variantData = {
        productId: product._id,
        name: vName,
        barcode: barcode,
        sku: barcode, // Sync SKU with barcode
        price: Number(row["Price"] || row["Giá bán"]) || 0,
        discountPrice: row["Sale Price"] !== undefined && row["Sale Price"] !== ""
          ? Number(row["Sale Price"])
          : row["Discount price"] !== undefined && row["Discount price"] !== ""
            ? Number(row["Discount price"])
            : undefined,
        stock: Number(row["Stock"] || row["Tồn kho"]) || 0,
        isActive: isVariantActive,
      };

      if (existingVariantsMap.has(vKey)) {
        await this.productRepo.updateVariant((existingVariantsMap.get(vKey) as any)._id.toString(), variantData);
      } else {
        // Brand new variant from Excel — sync opening balance
        const newVariant = await this.productRepo.createVariant(variantData);
        const initialStock = Number(variantData.stock ?? 0);
        if (initialStock > 0) {
          const estimatedPrice = Number(variantData.price ?? 0) * 0.6;
          await this.inventoryRepo.createBatch({
            variantId: newVariant._id,
            goodsReceiptId: null,
            batchCode: "TONDAU",
            importPrice: estimatedPrice,
            originalQty: initialStock,
            remainingQty: initialStock,
          });
          const txCode = `TXIN-OB-${newVariant._id.toString().slice(-6).toUpperCase()}-${Date.now()}`;
          let systemUser: any = await this.userService.getUserByRole("owner");
          if (!systemUser) systemUser = await this.userService.getUserByRole("manager");
          
          if (systemUser) {
            await this.inventoryRepo.createTransaction({
              code: txCode,
              productId: product._id,
              variantId: newVariant._id,
              type: "in",
              qty: initialStock,
              price: estimatedPrice,
              creatorId: systemUser._id,
              date: new Date(),
            });
          }
        }
      }
      totalProcessed++;
    }
  }

  this.invalidatePublicCache();
  return { totalProcessed };
};

  async syncProductPrices(productId: mongoose.Types.ObjectId | string) {
    const variantIds = await this.productRepo.findVariantIdsByProductId(productId.toString());
    const variants = await Promise.all(variantIds.map(id => this.productRepo.findVariantById(id)));
    const activeVariants = variants.filter((v: any) => v && v.isActive);
    let minPrice = 0;
    let maxPrice = 0;
    if (activeVariants.length > 0) {
      minPrice = Math.min(...activeVariants.map((v: any) => v.discountPrice && v.discountPrice > 0 ? v.discountPrice : v.price));
      maxPrice = Math.max(...activeVariants.map((v: any) => v.price));
    }
    await this.productRepo.updateById(productId.toString(), { minPrice, maxPrice } as any);
  }

}
