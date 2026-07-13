import mongoose from "mongoose";
import * as productRepo from "./product.repository.js";
import Variant from "./models/variant.schema.js";
import Brand from "../brand/models/brand.schema.js";
import Category from "../category/models/category.schema.js";
import Product from "./models/product.schema.js";
import { mapProduct } from "./dto/product.response.dto.js";
import {
  badRequest,
  notFound,
  conflict,
} from "../../shared/errors/httpErrors.js";
import { sanitizeRichText } from "../../shared/helpers/sanitize.js";
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

export const getPublicProducts = async ({
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

  if (search) query.name = { $regex: search.trim(), $options: "i" };

  if (onSale === "true") {
    const saleVariants = await Variant.find(
      { discountPrice: { $gt: 0 } },
      { productId: 1 },
    ).lean();
    const saleProductIds = [
      ...new Set(saleVariants.map((v: any) => v.productId.toString())),
    ];
    query._id = { $in: saleProductIds };
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    const minP = minPrice !== undefined ? Number(minPrice) : 0;
    const maxP =
      maxPrice !== undefined ? Number(maxPrice) : Number.MAX_SAFE_INTEGER;

    // Find variants where effective price (discountPrice > 0 ? discountPrice : price) is within range
    const variantsInRange = await Variant.aggregate([
      {
        $addFields: {
          effectivePrice: {
            $cond: [
              {
                $and: [
                  { $gt: ["$discountPrice", 0] },
                  { $ne: ["$discountPrice", null] },
                ],
              },
              "$discountPrice",
              "$price",
            ],
          },
        },
      },
      {
        $match: {
          effectivePrice: { $gte: minP, $lte: maxP },
        },
      },
      {
        $project: { productId: 1 },
      },
    ]);
    const productIds = variantsInRange.map((v) => v.productId);
    query._id = { $in: productIds };
  }

  const queryWithoutCategories = { ...query };

  if (category) {
    const categorySlugs = category
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const categoryIds = [];
    for (const slug of categorySlugs) {
      const ids = await productRepo.findCategoryIdsWithDescendants(slug);
      categoryIds.push(...ids);
    }
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
      query.brand = {
        $in: brandArr.map((b) => new RegExp("^" + b + "$", "i")),
      };
    }
  }

  // ── Sort logic ──────────────────────────────────────────────────────────────
  const isPrice = sort === "price_asc" || sort === "price_desc";

  // Map sort string → MongoDB sort object for simple field sorts
  const sortMap: Record<string, Record<string, any>> = {
    newest: { createdAt: -1 },
    top_sales: { soldCount: -1, createdAt: -1 },
    popular: { soldCount: -1, numReviews: -1, createdAt: -1 },
  };
  const mongoSort = sortMap[sort ?? "newest"] ?? { createdAt: -1 };

  try {
    // ── Cache for Metadata Aggregations ──────────────────────────────────────────
    // Key: query hash, Value: { brands, categories, expiresAt }
    const metadataCacheKey = JSON.stringify(queryWithoutBrands) + "|" + JSON.stringify(queryWithoutCategories);
    const now = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filterCache = (global as any).__filterCache || new Map();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).__filterCache = filterCache;

    let availableBrands: any[] = [];
    let availableCategoryIds: string[] = [];

    const cachedMeta = filterCache.get(metadataCacheKey);
    if (cachedMeta && cachedMeta.expiresAt > now) {
      availableBrands = cachedMeta.brands;
      availableCategoryIds = cachedMeta.categories;
    } else {
      try {
        // Parallel metadata queries (brands + categories in products)
        const [fetchedBrands, fetchedCats] = await Promise.all([
          productRepo.findBrandsInProducts(queryWithoutBrands).catch((e: any) => {
            console.error("[findBrands]", e.message);
            return [];
          }),
          productRepo
            .findCategoriesInProducts(queryWithoutCategories)
            .catch((e: any) => {
              console.error("[findCats]", e.message);
              return [];
            }),
        ]);
        availableBrands = fetchedBrands;
        availableCategoryIds = fetchedCats;
        // Cache for 60 seconds
        filterCache.set(metadataCacheKey, {
          brands: availableBrands,
          categories: availableCategoryIds,
          expiresAt: now + 60000,
        });

        // Simple cache cleanup
        if (filterCache.size > 1000) filterCache.clear();
      } catch (e: any) {
        console.error("Metadata fetch error:", e.message);
      }
    }

    // ── Price sort: aggregate variant min prices ───────────────────────────
    if (isPrice) {
      const priceOrder = sort === "price_asc" ? 1 : -1;

      // Get ALL matching product IDs
      const matchingDocs = await mongoose
        .model("Product")
        .find(query)
        .select("_id")
        .lean();
      const matchingIds = matchingDocs.map((d: any) => d._id);

      const priceSorted = await Variant.aggregate([
        { $match: { productId: { $in: matchingIds } } },
        {
          $addFields: {
            effectivePrice: {
              $cond: [
                {
                  $and: [
                    { $gt: ["$discountPrice", 0] },
                    { $ne: ["$discountPrice", null] },
                  ],
                },
                "$discountPrice",
                "$price",
              ],
            },
          },
        },
        {
          $group: { _id: "$productId", minPrice: { $min: "$effectivePrice" } },
        },
        { $sort: { minPrice: priceOrder } },
      ]);

      const total = priceSorted.length;
      const pagedIds = priceSorted
        .slice(skip, skip + parsedLimit)
        .map((r: any) => r._id);
      const products = await productRepo.findPublicByIds(pagedIds);

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

export const getPublicProductDetail = async (slugOrId: string) => {
  // Hỗ trợ cả slug lẫn MongoDB ObjectId (backward compat với cart items cũ)
  let product = null;
  if (mongoose.Types.ObjectId.isValid(slugOrId)) {
    product = await productRepo.findById(slugOrId);
  }
  if (!product) {
    product = await productRepo.findBySlug(slugOrId);
  }
  if (!product) throw notFound("Product not found");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((product.categoryId as any)?.isActive === false)
    throw notFound("Product not found because its category is inactive");
  return mapProduct(product);
};

export const getRecommendedProducts = async (
  productId: string,
  limit: number = 10,
) => {
  if (!mongoose.Types.ObjectId.isValid(productId))
    throw badRequest("Invalid product ID");
  const pId = new mongoose.Types.ObjectId(productId);

  const product = await productRepo.findById(productId);
  if (!product) throw notFound("Product not found");

  const { default: Order } = await import("../order/models/order.schema.js");

  // 1. Collaborative Filtering: "Customers who bought this also bought"
  const ordersAggregation = await Order.aggregate([
    { $match: { "items.productId": pId } },
    { $unwind: "$items" },
    { $match: { "items.productId": { $ne: pId } } },
    { $group: { _id: "$items.productId", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: limit }
  ]);

  const sortedIds = ordersAggregation.map(doc => doc._id);

  const recommendedProducts: any[] = [];

  if (sortedIds.length > 0) {
    const collabProducts = await productRepo.findPublic(
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

    const fallbackProducts = await productRepo.findPublic(
      {
        categoryId: product.categoryId,
        _id: { $nin: existingIds },
        isActive: true,
      },
      0,
      remainingSlots,
    );

    // Sort fallback by reviews/rating in memory to show the best related products
    fallbackProducts.sort((a, b) => (b.numReviews || 0) - (a.numReviews || 0));

    recommendedProducts.push(...fallbackProducts);
  }

  return recommendedProducts.map(mapProduct);
};

// ── ADMIN ─────────────────────────────────────────────────────────────────────

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

export const getAdminProducts = async ({
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
    const matchingVariants = await mongoose
      .model("Variant")
      .find({
        $or: [
          { barcode: { $regex: cleanSearch, $options: "i" } },
          { sku: { $regex: cleanSearch, $options: "i" } },
        ],
      })
      .select("productId")
      .lean();
    const variantProductIds = matchingVariants.map((v: any) => v.productId);

    query.$or = [
      { name: { $regex: cleanSearch, $options: "i" } },
      { _id: { $in: variantProductIds } },
    ];
  }
  if (status === "active") query.isActive = true;
  else if (status === "inactive") query.isActive = false;

  if (minStock !== undefined || maxStock !== undefined) {
    const stockQuery: any = {};
    if (minStock !== undefined) stockQuery.$gte = Number(minStock);
    if (maxStock !== undefined) stockQuery.$lte = Number(maxStock);

    const matchingVariants = await mongoose.model("Variant").find({ stock: stockQuery }).select("productId").lean();
    const productIds = matchingVariants.map((v: any) => v.productId);

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
      await productRepo.findCategoryIdsWithDescendants(category);
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
    productRepo.findAdmin(query, cursor || null, parsedLimit, page ? Number(page) : undefined),
    productRepo.countAll(query),
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

export const getAdminProductDetail = async (
  id: string,
) => {
  const product = await productRepo.findById(id);
  if (!product) throw notFound("Product not found");
  return mapProduct(product as any);
};

export const createProduct = async (data: CreateProductInput) => {
  const category = await productRepo.findCategoryById(data.categoryId);
  if (!category) throw badRequest("Category does not exist");

  const { default: Brand } =
    await import("../brand/models/brand.schema.js");
  const brandDoc = await Brand.findById(data.brandId);
  if (!brandDoc) throw badRequest("Brand does not exist");

  // Validate secondary categories if provided
  if (data.categoryIds && data.categoryIds.length > 0) {
    const validCategories = await Promise.all(
      data.categoryIds.map((id) => productRepo.findCategoryById(id)),
    );
    if (validCategories.some((c) => !c))
      throw badRequest("One or more subcategories do not exist");
  }

  const slug = slugify(data.name);
  const existing = await productRepo.findOneBy({
    slug,
    categoryId: data.categoryId,
  });
  if (existing) throw conflict("Product slug already exists in this category");

  const newProduct = await productRepo.create({
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
    const insertedVariants = await Variant.insertMany(variantsToCreate);

    // ── Opening Balance Sync ──────────────────────────────────────────────
    // For each variant with initial stock > 0, create an opening balance
    // Batch (TONDAU) and a corresponding InventoryTransaction so FEFO and
    // Moving Average Cost calculations have a valid starting point.
    const { default: Batch } = await import("../inventory/models/batch.schema.js");
    const { default: InventoryTransaction } = await import(
      "../inventory/models/inventory-transaction.schema.js"
    );
    for (let idx = 0; idx < insertedVariants.length; idx++) {
      const insertedVariant = insertedVariants[idx];
      const sourceVariant = data.variants[idx];
      const initialStock = Number(sourceVariant.stock ?? 0);
      if (initialStock <= 0) continue;

      const estimatedPrice = Number(sourceVariant.price ?? 0) * 0.6;
      await Batch.create({
        variantId: insertedVariant._id,
        goodsReceiptId: null,
        batchCode: "TONDAU",
        importPrice: estimatedPrice,
        originalQty: initialStock,
        remainingQty: initialStock,
      });

      const txCode = `TXIN-OB-${insertedVariant._id.toString().slice(-6).toUpperCase()}-${Date.now()}`;
      // Resolve a creatorId: prefer owner/manager, fallback to any user
      const { default: User } = await import("../user/models/user.schema.js");
      const systemUser = await User.findOne({ role: { $in: ["owner", "manager"] } }).select("_id").lean()
        ?? await User.findOne({}).select("_id").lean();
      if (systemUser) {
        await InventoryTransaction.create({
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

  const created = await productRepo.findById(newProduct._id.toString());
  return mapProduct(created!);
};

export const updateProduct = async (id: string, data: UpdateProductInput) => {
  const product = await productRepo.findDocumentById(id);
  if (!product)
    throw notFound("Product not found or you do not have permission to update");

  let nextCategoryId = product.categoryId;

  if (data.categoryId !== undefined) {
    const category = await productRepo.findCategoryById(data.categoryId);
    if (!category) throw badRequest("Category does not exist");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    product.categoryId = data.categoryId as any;
    nextCategoryId = data.categoryId as any;
  }

  // Update secondary categories (N:M assignments)
  if (data.categoryIds !== undefined) {
    if (data.categoryIds.length > 0) {
      const validCategories = await Promise.all(
        data.categoryIds.map((cid) => productRepo.findCategoryById(cid)),
      );
      if (validCategories.some((c) => !c))
        throw badRequest("One or more subcategories do not exist");
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (product as any).categoryIds = data.categoryIds as any;
  }

  if (data.name !== undefined) {
    const nextSlug = slugify(data.name);
    const existing = await productRepo.findOneBy({
      slug: nextSlug,
      categoryId: nextCategoryId,
      _id: { $ne: product._id },
    });
    if (existing) throw conflict("Product slug already exists in this category");
    product.name = data.name;
    product.slug = nextSlug;
  }

  if (data.brandId !== undefined) {
    const { default: Brand } =
      await import("../brand/models/brand.schema.js");
    const brandDoc = await Brand.findById(data.brandId);
    if (!brandDoc) throw badRequest("Brand does not exist");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    product.brandId = data.brandId as any;
  }

  if (data.description !== undefined)
    product.description = sanitizeRichText(data.description); // XSS protection
  if (data.imageUrl !== undefined) product.imageUrl = data.imageUrl;
  if (data.imageUrls !== undefined) product.imageUrls = data.imageUrls as any;
  if (data.isActive !== undefined) product.isActive = data.isActive;

  await productRepo.save(product);

  if (data.variants && data.variants.length > 0) {
    const { default: Brand } =
      await import("../brand/models/brand.schema.js");
    const brandDoc = await Brand.findById(product.brandId);

    const variantIdsToKeep = data.variants
      .filter((v: any) => v.id)
      .map((v: any) => v.id);
    await Variant.deleteMany({
      productId: product._id,
      _id: { $nin: variantIdsToKeep },
    });

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
        await Variant.updateOne({ _id: v.id }, { $set: variantPayload });
      } else {
        // New variant added during product update — sync opening balance
        const newVariant = await Variant.create({ ...variantPayload, productId: product._id });
        const initialStock = Number(v.stock ?? 0);
        if (initialStock > 0) {
          const { default: Batch } = await import("../inventory/models/batch.schema.js");
          const { default: InventoryTransaction } = await import(
            "../inventory/models/inventory-transaction.schema.js"
          );
          const estimatedPrice = Number(v.price ?? 0) * 0.6;
          await Batch.create({
            variantId: newVariant._id,
            goodsReceiptId: null,
            batchCode: "TONDAU",
            importPrice: estimatedPrice,
            originalQty: initialStock,
            remainingQty: initialStock,
          });
          const txCode = `TXIN-OB-${newVariant._id.toString().slice(-6).toUpperCase()}-${Date.now()}`;
          const { default: User } = await import("../user/models/user.schema.js");
          const systemUser = await User.findOne({ role: { $in: ["owner", "manager"] } }).select("_id").lean()
            ?? await User.findOne({}).select("_id").lean();
          if (systemUser) {
            await InventoryTransaction.create({
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

  const updated = await productRepo.findById(product._id.toString());
  return mapProduct(updated!);
};

export const updateProductStatus = async (
  id: string,
  isActive: boolean,
) => {
  const query: any = { _id: id };
  const product = await productRepo.findDocumentBy(query);
  if (!product)
    throw notFound("Product not found or you do not have permission to update");
  product.isActive = isActive;
  await productRepo.save(product);
  const updated = await productRepo.findById(product._id.toString());
  return mapProduct(updated!);
};

export const deleteProduct = async (id: string) => {
  const query: any = { _id: id };
  const product = await productRepo.findOneBy(query);
  if (!product)
    throw notFound("Không tìm thấy sản phẩm hoặc bạn không có quyền xóa");

  // ── Delete Guard ──────────────────────────────────────────────────────
  // Block hard-delete if the product has active inventory batches or
  // goods receipts. Use Discontinue (isActive = false) instead.
  const { default: VariantCheck } = await import("./models/variant.schema.js");
  const variantIds = await VariantCheck.find({ productId: id }).select("_id").lean();
  if (variantIds.length > 0) {
    const { default: Batch } = await import("../inventory/models/batch.schema.js");
    const activeBatchCount = await Batch.countDocuments({
      variantId: { $in: variantIds.map((v: any) => v._id) },
      remainingQty: { $gt: 0 },
    });
    if (activeBatchCount > 0) {
      throw conflict(
        `Cannot delete this product — it has ${activeBatchCount} active inventory batch(es) with remaining stock. Use "Discontinue" (set inactive) instead.`,
      );
    }

    const { default: InventoryTransaction } = await import(
      "../inventory/models/inventory-transaction.schema.js"
    );
    const txCount = await InventoryTransaction.countDocuments({
      variantId: { $in: variantIds.map((v: any) => v._id) },
    });
    if (txCount > 0) {
      throw conflict(
        `Cannot delete this product — it has ${txCount} inventory transaction record(s). Use "Discontinue" (set inactive) to preserve audit history.`,
      );
    }
  }

  await productRepo.findByIdAndDelete(id);
  const { default: Variant } = await import("./models/variant.schema.js");
  await Variant.deleteMany({ productId: id });

  const { default: Review } = await import("../review/models/review.schema.js");
  await Review.deleteMany({ productId: id });
};

export const batchImportProducts = async (productsData: any[]) => {
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
      let brand = await Brand.findOne({ name: new RegExp(`^${brandName}$`, 'i') });
      if (!brand) {
        brand = await Brand.create({ name: brandName, slug: slugify(brandName) });
      }
      brandId = brand._id;
    }

    let categoryId: mongoose.Types.ObjectId | undefined;
    const categoryName = firstRow["Category"];
    if (categoryName) {
      let cat = await Category.findOne({ name: new RegExp(`^${categoryName}$`, 'i') });
      if (!cat) {
        cat = await Category.create({ name: categoryName, slug: slugify(categoryName) });
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

    let product = await Product.findOne({ slug });
    if (product) {
      await Product.findByIdAndUpdate(product._id, productData);
    } else {
      product = await Product.create(productData);
    }

    const existingVariants = await Variant.find({ productId: product._id });
    const existingVariantsMap = new Map(
      existingVariants.map(v => [v.barcode || v.sku || v.name, v])
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
        await Variant.findByIdAndUpdate(existingVariantsMap.get(vKey)!._id, variantData);
      } else {
        // Brand new variant from Excel — sync opening balance
        const newVariant = await Variant.create(variantData);
        const initialStock = Number(variantData.stock ?? 0);
        if (initialStock > 0) {
          const { default: Batch } = await import("../inventory/models/batch.schema.js");
          const { default: InventoryTransaction } = await import(
            "../inventory/models/inventory-transaction.schema.js"
          );
          const estimatedPrice = Number(variantData.price ?? 0) * 0.6;
          await Batch.create({
            variantId: newVariant._id,
            goodsReceiptId: null,
            batchCode: "TONDAU",
            importPrice: estimatedPrice,
            originalQty: initialStock,
            remainingQty: initialStock,
          });
          const txCode = `TXIN-OB-${newVariant._id.toString().slice(-6).toUpperCase()}-${Date.now()}`;
          const { default: User } = await import("../user/models/user.schema.js");
          const systemUser = await User.findOne({ role: { $in: ["owner", "manager"] } }).select("_id").lean()
            ?? await User.findOne({}).select("_id").lean();
          if (systemUser) {
            await InventoryTransaction.create({
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

  return { totalProcessed };
};
