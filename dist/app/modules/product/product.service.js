import mongoose from "mongoose";
import * as productRepo from "./product.repository.js";
import Variant from "./models/variant.schema.js";
import Brand from "../brand/models/brand.schema.js";
import Category from "../category/models/category.schema.js";
import Product from "./models/product.schema.js";
import { mapProduct } from "./dto/product.response.dto.js";
import { badRequest, notFound, conflict, } from "../../shared/errors/httpErrors.js";
import { sanitizeRichText } from "../../shared/helpers/sanitize.js";
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
export const getPublicProducts = async ({ category, brandId, search, onSale, page = 1, limit = 12, minPrice, maxPrice, brands, sort, }) => {
    const parsedPage = Math.max(Number(page) || 1, 1);
    const parsedLimit = Math.max(Number(limit) || 12, 1);
    const skip = (parsedPage - 1) * parsedLimit;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query = { isActive: true };
    if (search)
        query.name = { $regex: search.trim(), $options: "i" };
    if (onSale === "true") {
        const saleVariants = await Variant.find({ discountPrice: { $gt: 0 } }, { productId: 1 }).lean();
        const saleProductIds = [
            ...new Set(saleVariants.map((v) => v.productId.toString())),
        ];
        query._id = { $in: saleProductIds };
    }
    if (minPrice !== undefined || maxPrice !== undefined) {
        const minP = minPrice !== undefined ? Number(minPrice) : 0;
        const maxP = maxPrice !== undefined ? Number(maxPrice) : Number.MAX_SAFE_INTEGER;
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
    }
    else if (brands) {
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
    const sortMap = {
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
        const filterCache = global.__filterCache || new Map();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        global.__filterCache = filterCache;
        let availableBrands = [];
        let availableCategoryIds = [];
        const cachedMeta = filterCache.get(metadataCacheKey);
        if (cachedMeta && cachedMeta.expiresAt > now) {
            availableBrands = cachedMeta.brands;
            availableCategoryIds = cachedMeta.categories;
        }
        else {
            try {
                // Parallel metadata queries (brands + categories in products)
                const [fetchedBrands, fetchedCats] = await Promise.all([
                    productRepo.findBrandsInProducts(queryWithoutBrands).catch((e) => {
                        console.error("[findBrands]", e.message);
                        return [];
                    }),
                    productRepo
                        .findCategoriesInProducts(queryWithoutCategories)
                        .catch((e) => {
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
                if (filterCache.size > 1000)
                    filterCache.clear();
            }
            catch (e) {
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
            const matchingIds = matchingDocs.map((d) => d._id);
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
                .map((r) => r._id);
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
    }
    catch (error) {
        console.error("[getPublicProducts] Fatal error:", error?.message, error?.stack?.slice(0, 300));
        throw error;
    }
};
export const getPublicProductDetail = async (slugOrId) => {
    // Hỗ trợ cả slug lẫn MongoDB ObjectId (backward compat với cart items cũ)
    let product = null;
    if (mongoose.Types.ObjectId.isValid(slugOrId)) {
        product = await productRepo.findById(slugOrId);
    }
    if (!product) {
        product = await productRepo.findBySlug(slugOrId);
    }
    if (!product)
        throw notFound("Product not found");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (product.categoryId?.isActive === false)
        throw notFound("Product not found because its category is inactive");
    return mapProduct(product);
};
export const getRecommendedProducts = async (productId, limit = 10) => {
    if (!mongoose.Types.ObjectId.isValid(productId))
        throw badRequest("Invalid product ID");
    const pId = new mongoose.Types.ObjectId(productId);
    const product = await productRepo.findById(productId);
    if (!product)
        throw notFound("Product not found");
    const { default: Order } = await import("../order/models/order.schema.js");
    // 1. Collaborative Filtering: "Customers who bought this also bought"
    const orders = await Order.find({ "items.productId": { $in: [pId, pId.toString()] } })
        .select("items.productId")
        .lean();
    const frequencyMap = {};
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
    const recommendedProducts = [];
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
        const fallbackProducts = await productRepo.findPublic({
            categoryId: product.categoryId,
            _id: { $nin: existingIds },
            isActive: true,
        }, 0, remainingSlots);
        // Sort fallback by reviews/rating in memory to show the best related products
        fallbackProducts.sort((a, b) => (b.numReviews || 0) - (a.numReviews || 0));
        recommendedProducts.push(...fallbackProducts);
    }
    return recommendedProducts.map(mapProduct);
};
export const getAdminProducts = async ({ search, category, brandId, status, minStock, maxStock, cursor, limit = 20, page, }) => {
    const parsedLimit = Math.max(Number(limit) || 20, 1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query = {};
    if (search)
        query.name = { $regex: search.trim(), $options: "i" };
    if (status === "active")
        query.isActive = true;
    else if (status === "inactive")
        query.isActive = false;
    if (minStock !== undefined || maxStock !== undefined) {
        const stockQuery = {};
        if (minStock !== undefined)
            stockQuery.$gte = Number(minStock);
        if (maxStock !== undefined)
            stockQuery.$lte = Number(maxStock);
        const matchingVariants = await mongoose.model("Variant").find({ stock: stockQuery }).select("productId").lean();
        const productIds = matchingVariants.map((v) => v.productId);
        if (query._id) {
            // If _id is already filtered (unlikely in this query, but safe)
            query._id = { ...query._id, $in: productIds };
        }
        else {
            query._id = { $in: productIds };
        }
    }
    if (brandId) {
        query.brandId = new mongoose.Types.ObjectId(brandId);
    }
    if (category) {
        const categoryIds = await productRepo.findCategoryIdsWithDescendants(category);
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
export const getAdminProductDetail = async (id) => {
    const query = { _id: id };
    const product = await productRepo.findDocumentBy(query);
    if (!product)
        throw notFound("Product not found");
    return mapProduct(product);
};
export const createProduct = async (data) => {
    const category = await productRepo.findCategoryById(data.categoryId);
    if (!category)
        throw badRequest("Category does not exist");
    const { default: Brand } = await import("../brand/models/brand.schema.js");
    const brandDoc = await Brand.findById(data.brandId);
    if (!brandDoc)
        throw badRequest("Brand does not exist");
    // Validate secondary categories if provided
    if (data.categoryIds && data.categoryIds.length > 0) {
        const validCategories = await Promise.all(data.categoryIds.map((id) => productRepo.findCategoryById(id)));
        if (validCategories.some((c) => !c))
            throw badRequest("One or more subcategories do not exist");
    }
    const slug = slugify(data.name);
    const existing = await productRepo.findOneBy({
        slug,
        categoryId: data.categoryId,
    });
    if (existing)
        throw conflict("Product slug already exists in this category");
    const newProduct = await productRepo.create({
        ...data,
        slug,
        description: sanitizeRichText(data.description ?? ""), // XSS protection
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        categoryId: data.categoryId,
        categoryIds: (data.categoryIds ?? []),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        brandId: data.brandId,
    });
    if (data.variants && data.variants.length > 0) {
        const variantsToCreate = data.variants.map((v, idx) => ({
            ...v,
            productId: newProduct._id,
            sku: v.sku?.trim() ||
                `SKU-${slugify(brandDoc.name).slice(0, 3).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}-${idx}`,
        }));
        await Variant.insertMany(variantsToCreate);
    }
    const created = await productRepo.findById(newProduct._id.toString());
    return mapProduct(created);
};
export const updateProduct = async (id, data) => {
    const product = await productRepo.findDocumentById(id);
    if (!product)
        throw notFound("Product not found or you do not have permission to update");
    let nextCategoryId = product.categoryId;
    if (data.categoryId !== undefined) {
        const category = await productRepo.findCategoryById(data.categoryId);
        if (!category)
            throw badRequest("Category does not exist");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        product.categoryId = data.categoryId;
        nextCategoryId = data.categoryId;
    }
    // Update secondary categories (N:M assignments)
    if (data.categoryIds !== undefined) {
        if (data.categoryIds.length > 0) {
            const validCategories = await Promise.all(data.categoryIds.map((cid) => productRepo.findCategoryById(cid)));
            if (validCategories.some((c) => !c))
                throw badRequest("One or more subcategories do not exist");
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        product.categoryIds = data.categoryIds;
    }
    if (data.name !== undefined) {
        const nextSlug = slugify(data.name);
        const existing = await productRepo.findOneBy({
            slug: nextSlug,
            categoryId: nextCategoryId,
            _id: { $ne: product._id },
        });
        if (existing)
            throw conflict("Product slug already exists in this category");
        product.name = data.name;
        product.slug = nextSlug;
    }
    if (data.brandId !== undefined) {
        const { default: Brand } = await import("../brand/models/brand.schema.js");
        const brandDoc = await Brand.findById(data.brandId);
        if (!brandDoc)
            throw badRequest("Brand does not exist");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        product.brandId = data.brandId;
    }
    if (data.description !== undefined)
        product.description = sanitizeRichText(data.description); // XSS protection
    if (data.imageUrl !== undefined)
        product.imageUrl = data.imageUrl;
    if (data.imageUrls !== undefined)
        product.imageUrls = data.imageUrls;
    if (data.isActive !== undefined)
        product.isActive = data.isActive;
    await productRepo.save(product);
    if (data.variants && data.variants.length > 0) {
        const { default: Brand } = await import("../brand/models/brand.schema.js");
        const brandDoc = await Brand.findById(product.brandId);
        const variantIdsToKeep = data.variants
            .filter((v) => v.id)
            .map((v) => v.id);
        await Variant.deleteMany({
            productId: product._id,
            _id: { $nin: variantIdsToKeep },
        });
        for (let idx = 0; idx < data.variants.length; idx++) {
            const v = data.variants[idx];
            const skuToUse = v.sku?.trim() ||
                `SKU-${slugify(brandDoc?.name || "SP")
                    .slice(0, 3)
                    .toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}-${idx}`;
            const variantPayload = { ...v, sku: skuToUse };
            delete variantPayload.id;
            if (v.id) {
                await Variant.updateOne({ _id: v.id }, { $set: variantPayload });
            }
            else {
                await Variant.create({ ...variantPayload, productId: product._id });
            }
        }
    }
    const updated = await productRepo.findById(product._id.toString());
    return mapProduct(updated);
};
export const updateProductStatus = async (id, isActive) => {
    const query = { _id: id };
    const product = await productRepo.findDocumentBy(query);
    if (!product)
        throw notFound("Product not found or you do not have permission to update");
    product.isActive = isActive;
    await productRepo.save(product);
    const updated = await productRepo.findById(product._id.toString());
    return mapProduct(updated);
};
export const deleteProduct = async (id) => {
    const query = { _id: id };
    const product = await productRepo.findOneBy(query);
    if (!product)
        throw notFound("Không tìm thấy sản phẩm hoặc bạn không có quyền xóa");
    await productRepo.findByIdAndDelete(id);
    const { default: Variant } = await import("./models/variant.schema.js");
    await Variant.deleteMany({ productId: id });
};
export const batchImportProducts = async (productsData) => {
    let totalProcessed = 0;
    const productGroups = new Map();
    for (const row of productsData) {
        const slug = row["Slug"] || slugify(row["Product name"]);
        if (!slug)
            continue;
        if (!productGroups.has(slug)) {
            productGroups.set(slug, []);
        }
        productGroups.get(slug).push(row);
    }
    for (const [slug, rows] of productGroups.entries()) {
        const firstRow = rows[0];
        let brandId;
        if (firstRow["Brand"]) {
            let brand = await Brand.findOne({ name: new RegExp(`^${firstRow["Brand"]}$`, 'i') });
            if (!brand) {
                brand = await Brand.create({ name: firstRow["Brand"], slug: slugify(firstRow["Brand"]) });
            }
            brandId = brand._id;
        }
        let categoryId;
        if (firstRow["Category"]) {
            let cat = await Category.findOne({ name: new RegExp(`^${firstRow["Category"]}$`, 'i') });
            if (!cat) {
                cat = await Category.create({ name: firstRow["Category"], slug: slugify(firstRow["Category"]) });
            }
            categoryId = cat._id;
        }
        const productData = {
            name: firstRow["Product name"],
            slug: slug,
            brandId: brandId,
            categoryId: categoryId,
            description: firstRow["Mô tả"] || "",
            isActive: firstRow["Trạng thái (Sản phẩm)"] === "Đang bán",
        };
        if (!productData.name || !brandId || !categoryId) {
            continue;
        }
        let product = await Product.findOne({ slug });
        if (product) {
            await Product.findByIdAndUpdate(product._id, productData);
        }
        else {
            product = await Product.create(productData);
        }
        const existingVariants = await Variant.find({ productId: product._id });
        const existingVariantsMap = new Map(existingVariants.map(v => [v.sku || v.name, v]));
        for (const row of rows) {
            const vName = row["Tên biến thể"] || "Mặc định";
            const vSku = row["SKU"] || "";
            const vKey = vSku || vName;
            const variantData = {
                productId: product._id,
                name: vName,
                sku: vSku,
                price: Number(row["Giá bán"]) || 0,
                discountPrice: row["Discount price"] ? Number(row["Discount price"]) : undefined,
                stock: Number(row["Tồn kho"]) || 0,
                isActive: row["Trạng thái (Biến thể)"] !== "Discontinued",
            };
            if (existingVariantsMap.has(vKey)) {
                await Variant.findByIdAndUpdate(existingVariantsMap.get(vKey)._id, variantData);
            }
            else {
                await Variant.create(variantData);
            }
            totalProcessed++;
        }
    }
    return { totalProcessed };
};
