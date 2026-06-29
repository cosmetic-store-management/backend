import type { CategoryDocument } from "../models/category.schema.js";

export interface CategoryResponse {
  id: string;
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
  iconUrl: string;
  bannerUrl: string;
  parentId: string | null;
  isActive: boolean;
  sortOrder: number;
  productCount?: number;
  children?: CategoryResponse[];
}

export const mapCategory = (category: CategoryDocument): CategoryResponse => ({
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
  productCount: (category as any).productCount,
  children: (category as any).children?.map((child: any) => mapCategory(child)),
});
