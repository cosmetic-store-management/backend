export const mapCategory = (category) => ({
    id: category._id.toString(),
    name: category.name,
    slug: category.slug,
    description: category.description,
    imageUrl: category.imageUrl || "",
    iconUrl: category.iconUrl || "",
    bannerUrl: category.bannerUrl || "",
    parentId: category.parentId ? category.parentId.toString() : null,
    isActive: category.isActive,
    sortOrder: category.sortOrder,
    productCount: category.productCount,
    children: category.children?.map((child) => mapCategory(child)),
});
