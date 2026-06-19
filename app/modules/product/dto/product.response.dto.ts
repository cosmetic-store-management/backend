import type { ProductDocument } from "../../../models/product.schema.js";
import type { Types } from "mongoose";
import type { VariantDocument } from "../../../models/variant.schema.js";

// ─── Populated sub-types ──────────────────────────────────────────────────────

interface PopulatedCategory {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  imageUrl: string;
}

interface PopulatedBrand {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  imageUrl: string;
  country: string;
  isActive: boolean;
}

type ProductWithPopulated = Omit<ProductDocument, "categoryId" | "brandId"> & {
  categoryId:  Types.ObjectId | PopulatedCategory;
  categoryIds?: (Types.ObjectId | PopulatedCategory)[];
  brandId?:    Types.ObjectId | PopulatedBrand;
  variants?:   VariantDocument[];
};

// ─── Response shape ───────────────────────────────────────────────────────────

export interface BrandRef {
  id:      string;
  name:    string;
  slug:    string;
  imageUrl: string;
  country: string;
}

export interface CategoryRef {
  id:      string;
  name:    string;
  slug:    string;
  imageUrl: string;
}

export interface ProductResponse {
  id:            string;
  name:          string;
  slug:          string;
  // Brand — primary source of truth is brand object; brand string is legacy fallback
  brandId:       string;
  brand:         BrandRef | null;    // populated object (preferred)
  brandName:     string;             // quick access string (from brandId.name or legacy brand field)
  description:   string;
  imageUrl:      string;
  imageUrls:     string[];
  isActive:      boolean;
  // Category — primary (breadcrumb) + secondary (filter assignments)
  categoryId:    string;
  category:      CategoryRef | null;
  categoryIds:   string[];           // secondary category IDs (N:M)
  categories:    CategoryRef[];      // secondary categories populated
  variants:      any[];
  averageRating: number;
  numReviews:    number;
  soldCount:     number;
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

const mapCategoryRef = (raw: Types.ObjectId | PopulatedCategory | null | undefined): CategoryRef | null => {
  if (!raw) return null;
  if (typeof raw === "object" && "name" in raw) {
    return {
      id:       (raw as PopulatedCategory)._id.toString(),
      name:     (raw as PopulatedCategory).name,
      slug:     (raw as PopulatedCategory).slug,
      imageUrl: (raw as PopulatedCategory).imageUrl ?? "",
    };
  }
  return null;
};

const mapBrandRef = (raw: Types.ObjectId | PopulatedBrand | null | undefined): BrandRef | null => {
  if (!raw) return null;
  if (typeof raw === "object" && "name" in raw) {
    return {
      id:       (raw as PopulatedBrand)._id.toString(),
      name:     (raw as PopulatedBrand).name,
      slug:     (raw as PopulatedBrand).slug ?? "",
      imageUrl: (raw as PopulatedBrand).imageUrl ?? "",
      country:  (raw as PopulatedBrand).country ?? "",
    };
  }
  return null;
};

export const mapProduct = (product: ProductWithPopulated | ProductDocument): ProductResponse => {
  const p = product as ProductWithPopulated;

  const brandObj   = mapBrandRef(p.brandId as any);
  const categoryObj = mapCategoryRef(p.categoryId as any);

  // Secondary categories populated
  const secCategories: CategoryRef[] = [];
  const secCategoryIds: string[] = [];
  for (const c of (p.categoryIds ?? [])) {
    const mapped = mapCategoryRef(c as any);
    if (mapped) {
      secCategories.push(mapped);
      secCategoryIds.push(mapped.id);
    } else if (c) {
      secCategoryIds.push(c.toString());
    }
  }

  return {
    id:            product._id.toString(),
    name:          product.name,
    slug:          product.slug,
    brandId:       p.brandId ? (typeof p.brandId === "object" && "_id" in (p.brandId as any)
                     ? (p.brandId as PopulatedBrand)._id.toString()
                     : (p.brandId as Types.ObjectId).toString()) : "",
    brand:         brandObj,
    brandName:     brandObj?.name ?? (product as any).brand ?? "",
    description:   product.description,
    imageUrl:      product.imageUrl,
    imageUrls:     product.imageUrls || [],
    isActive:      product.isActive,
    categoryId:    categoryObj ? categoryObj.id : (p.categoryId ? p.categoryId.toString() : ""),
    category:      categoryObj,
    categoryIds:   secCategoryIds,
    categories:    secCategories,
    variants: ((product as any).variants ?? []).map((v: any) => ({
      id:            v._id.toString(),
      name:          v.name,
      sku:           v.sku,
      barcode:       v.barcode ?? "",
      price:         v.price,
      discountPrice: v.discountPrice,
      stock:         v.stock,
      minStock:      v.minStock,
      weight:        v.weight,
      imageUrl:      v.imageUrl,
      attributes:    v.attributes,
      isActive:      v.isActive,
    })),
    averageRating: product.averageRating || 0,
    numReviews:    product.numReviews || 0,
    soldCount:     product.soldCount || 0,
  };
};
