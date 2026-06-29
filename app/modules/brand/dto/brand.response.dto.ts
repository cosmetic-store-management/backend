import type { BrandDocument } from "../models/brand.schema.js";

export interface BrandResponse {
  id: string;
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
  country: string;
  isActive: boolean;
  productCount: number;
}

export const mapBrand = (
  brand: BrandDocument,
  productCount = 0,
): BrandResponse => ({
  id: brand._id.toString(),
  name: brand.name,
  slug: brand.slug,
  description: brand.description,
  imageUrl: brand.imageUrl,
  country: brand.country,
  isActive: brand.isActive,
  productCount,
});
