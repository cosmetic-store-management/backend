// ─── Mapper ───────────────────────────────────────────────────────────────────
const mapCategoryRef = (raw) => {
    if (!raw)
        return null;
    if (typeof raw === "object" && "name" in raw) {
        return {
            id: raw._id.toString(),
            name: raw.name,
            slug: raw.slug,
            imageUrl: raw.imageUrl ?? "",
        };
    }
    return null;
};
const mapBrandRef = (raw) => {
    if (!raw)
        return null;
    if (typeof raw === "object" && "name" in raw) {
        return {
            id: raw._id.toString(),
            name: raw.name,
            slug: raw.slug ?? "",
            imageUrl: raw.imageUrl ?? "",
            country: raw.country ?? "",
        };
    }
    return null;
};
export const mapProduct = (product) => {
    const p = product;
    const brandObj = mapBrandRef(p.brandId);
    const categoryObj = mapCategoryRef(p.categoryId);
    // Secondary categories populated
    const secCategories = [];
    const secCategoryIds = [];
    for (const c of (p.categoryIds ?? [])) {
        const mapped = mapCategoryRef(c);
        if (mapped) {
            secCategories.push(mapped);
            secCategoryIds.push(mapped.id);
        }
        else if (c) {
            secCategoryIds.push(c.toString());
        }
    }
    return {
        id: product._id.toString(),
        name: product.name,
        slug: product.slug,
        brandId: p.brandId ? (typeof p.brandId === "object" && "_id" in p.brandId
            ? p.brandId._id.toString()
            : p.brandId.toString()) : "",
        brand: brandObj,
        brandName: brandObj?.name ?? product.brand ?? "",
        description: product.description,
        imageUrl: product.imageUrl,
        imageUrls: product.imageUrls || [],
        isActive: product.isActive,
        categoryId: categoryObj ? categoryObj.id : (p.categoryId ? p.categoryId.toString() : ""),
        category: categoryObj,
        categoryIds: secCategoryIds,
        categories: secCategories,
        variants: (product.variants ?? []).map((v) => ({
            id: v._id.toString(),
            name: v.name,
            sku: v.sku,
            barcode: v.barcode ?? "",
            price: v.price,
            discountPrice: v.discountPrice,
            stock: v.stock,
            minStock: v.minStock,
            weight: v.weight,
            imageUrl: v.imageUrl,
            attributes: v.attributes,
            isActive: v.isActive,
        })),
        averageRating: product.averageRating || 0,
        numReviews: product.numReviews || 0,
        soldCount: product.soldCount || 0,
    };
};
