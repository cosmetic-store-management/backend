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
  website?: string;
  contactPhone?: string;
  contactEmail?: string;
  supplierName?: string;
  minimumOrderValue?: number;
  leadTimeDays?: number;
  supplierId?: string;
  supplier?: {
    id: string;
    name: string;
    phone: string;
    email: string;
    address: string;
    contactPerson?: string;
    contactPhone?: string;
    contactEmail?: string;
    contactPosition?: string;
  };
}

export const mapBrand = (
  brand: BrandDocument,
  productCount = 0,
): BrandResponse => {
  const isPopulated = brand.supplierId && typeof brand.supplierId === "object" && "name" in brand.supplierId;
  return {
    id: brand._id.toString(),
    name: brand.name,
    slug: brand.slug,
    description: brand.description,
    imageUrl: brand.imageUrl,
    country: brand.country,
    isActive: brand.isActive,
    productCount,
    website: brand.website,
    contactPhone: brand.contactPhone,
    contactEmail: brand.contactEmail,
    supplierName: brand.supplierName,
    minimumOrderValue: brand.minimumOrderValue,
    leadTimeDays: brand.leadTimeDays,
    supplierId: isPopulated
      ? (brand.supplierId as any)._id?.toString()
      : brand.supplierId?.toString(),
    supplier: isPopulated
      ? {
          id: (brand.supplierId as any)._id?.toString() || (brand.supplierId as any).id?.toString(),
          name: (brand.supplierId as any).name,
          phone: (brand.supplierId as any).phone,
          email: (brand.supplierId as any).email || "",
          address: (brand.supplierId as any).address || "",
          contactPerson: (brand.supplierId as any).contactPerson || "",
          contactPhone: (brand.supplierId as any).contactPhone || "",
          contactEmail: (brand.supplierId as any).contactEmail || "",
          contactPosition: (brand.supplierId as any).contactPosition || "",
        }
      : undefined,
  };
};
