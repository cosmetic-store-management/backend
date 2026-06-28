import type { IFlashSale } from "../../../models/marketing/flash-sale.schema.js";

export const mapFlashSale = (fs: IFlashSale | any) => {
  return {
    id: fs._id.toString(),
    name: fs.name,
    startTime: fs.startTime,
    endTime: fs.endTime,
    isActive: fs.isActive,
    items: (fs.items || []).map((item: any) => ({
      productId: item.productId._id ? item.productId._id.toString() : item.productId.toString(),
      productName: item.productId.name,
      productSlug: item.productId.slug,
      productBrand: item.productId.brandId?.name || item.productId.brand,
      productImage: item.productId.imageUrl,
      variantId: item.variantId._id ? item.variantId._id.toString() : item.variantId.toString(),
      variantName: item.variantId.name,
      sku: item.variantId.sku,
      originalPrice: item.variantId.price,
      flashPrice: item.flashPrice,
      quantityLimit: item.quantityLimit,
      soldQuantity: item.soldQuantity,
    })),
    createdAt: fs.createdAt,
    updatedAt: fs.updatedAt,
  };
};
