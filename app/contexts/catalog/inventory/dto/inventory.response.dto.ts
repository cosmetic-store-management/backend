// ── Inventory Response DTOs ───────────────────────────────────────────────────

// ── Supplier ──────────────────────────────────────────────────────────────────

export interface SupplierResponse {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  taxCode?: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  contactPosition?: string;
  isActive?: boolean;
  notes?: string;
}

export function mapSupplier(doc: any): SupplierResponse {
  return {
    id: doc._id.toString(),
    name: doc.name,
    phone: doc.phone,
    email: doc.email,
    address: doc.address,
    taxCode: doc.taxCode,
    contactPerson: doc.contactPerson,
    contactPhone: doc.contactPhone,
    contactEmail: doc.contactEmail,
    contactPosition: doc.contactPosition,
    isActive: doc.isActive,
    notes: doc.notes,
  };
}

// ── Stock Item ────────────────────────────────────────────────────────────────

export interface StockItemResponse {
  id: string;
  name: string; // "{productName} - {variantName}"
  sku: string;
  barcode?: string;
  stock: number;
  minStock: number;
  brandId: string;
  brandName: string;
  brandImage: string;
  productImage?: string;
  supplier: string;
  lastUpdated: string;
  expiringBatchesCount?: number;
  manufactureDate?: string;
  expiryDate?: string;
  supplierInfo?: SupplierResponse;
}

export interface StockListResponse {
  stock: StockItemResponse[];
  pagination: PaginationMeta;
}

// ── Inventory Transaction ─────────────────────────────────────────────────────

export interface TransactionResponse {
  id: string; // transaction code
  sku: string;
  type: "in" | "out" | "adjustment";
  qty: number;
  user: string;
  date: string;
  productName?: string;
  productImage?: string;
  barcode?: string;
  price?: number;
}

export interface TransactionListResponse {
  transactions: TransactionResponse[];
  pagination: PaginationMeta;
}

// ── Goods Receipt ─────────────────────────────────────────────────────────────

export interface GoodsReceiptItemResponse {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  quantity: number;
  importPrice: number;
  barcode?: string;
  productImage?: string;
}

export interface GoodsReceiptResponse {
  id: string;
  code: string;
  supplierId: string;
  supplierName?: string;
  items: GoodsReceiptItemResponse[];
  totalAmount: number;
  creatorId: string;
  creatorName?: string;
  createdAt: string;
}

export function mapGoodsReceipt(doc: any): GoodsReceiptResponse {
  return {
    id: doc._id.toString(),
    code: doc.code,
    supplierId: doc.supplierId && typeof doc.supplierId === "object" ? (doc.supplierId as any)._id?.toString() : doc.supplierId?.toString(),
    supplierName: doc.supplierId && typeof doc.supplierId === "object" && "name" in doc.supplierId ? (doc.supplierId as any).name : undefined,
    items: (doc.items || []).map((item: any) => {
      const prod = item.productId && typeof item.productId === "object" ? item.productId : null;
      const variant = item.variantId && typeof item.variantId === "object" ? item.variantId : null;
      
      const barcode = variant?.barcode || variant?.sku || "";
      const productImage = variant?.imageUrl || prod?.imageUrl || prod?.imageUrls?.[0] || "";
      const pName = prod?.name || item.productName;
      const vName = variant?.name || item.variantName;

      return {
        productId: prod ? prod._id?.toString() : item.productId?.toString(),
        variantId: variant ? variant._id?.toString() : item.variantId?.toString(),
        productName: pName,
        variantName: vName,
        quantity: item.quantity,
        importPrice: item.importPrice,
        barcode,
        productImage,
      };
    }),
    totalAmount: doc.totalAmount,
    creatorId: doc.creatorId && typeof doc.creatorId === "object" ? (doc.creatorId as any)._id?.toString() : doc.creatorId?.toString(),
    creatorName: doc.creatorId && typeof doc.creatorId === "object" && "name" in doc.creatorId ? (doc.creatorId as any).name : undefined,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : "",
  };
}

// ── Stocktake ─────────────────────────────────────────────────────────────────

export interface StocktakeItemResponse {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  systemQty: number;
  actualQty: number;
  variance: number;
}

export interface StocktakeResponse {
  id: string;
  code: string;
  items: StocktakeItemResponse[];
  totalVarianceQty: number;
  totalAdjustmentValue: number;
  creatorId: string;
  creatorName?: string;
  notes?: string;
  createdAt: string;
}

export function mapStocktake(doc: any): StocktakeResponse {
  return {
    id: doc._id.toString(),
    code: doc.code,
    items: (doc.items || []).map((item: any) => ({
      productId: item.productId?.toString(),
      variantId: item.variantId?.toString(),
      productName: item.productName,
      variantName: item.variantName,
      systemQty: item.systemQty,
      actualQty: item.actualQty,
      variance: item.variance,
    })),
    totalVarianceQty: doc.totalVarianceQty,
    totalAdjustmentValue: doc.totalAdjustmentValue,
    creatorId: doc.creatorId && typeof doc.creatorId === "object" ? (doc.creatorId as any)._id?.toString() : doc.creatorId?.toString(),
    creatorName: doc.creatorId && typeof doc.creatorId === "object" && "name" in doc.creatorId ? (doc.creatorId as any).name : undefined,
    notes: doc.notes,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : "",
  };
}

// ── Shared Pagination Meta ────────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  limit: number;
  totalPages: number;
  totalItems: number;
}
