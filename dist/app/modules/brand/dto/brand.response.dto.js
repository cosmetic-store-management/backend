export const mapBrand = (brand, productCount = 0) => ({
    id: brand._id.toString(),
    name: brand.name,
    slug: brand.slug,
    description: brand.description,
    imageUrl: brand.imageUrl,
    country: brand.country,
    isActive: brand.isActive,
    productCount,
});
