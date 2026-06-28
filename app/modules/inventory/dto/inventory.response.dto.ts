// ── Inventory Response DTOs ───────────────────────────────────────────────────

// ── Supplier ──────────────────────────────────────────────────────────────────

export interface SupplierResponse {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
}

export function mapSupplier(doc: any): SupplierResponse {
  return {
    id: doc._id.toString(),
    name: doc.name,
    phone: doc.phone,
    email: doc.email,
    address: doc.address,
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
}

export interface GoodsReceiptResponse {
  id: string;
  code: string;
  supplierId: string;
  items: GoodsReceiptItemResponse[];
  totalAmount: number;
  createdAt: string;
}

export function mapGoodsReceipt(doc: any): GoodsReceiptResponse {
  return {
    id: doc._id.toString(),
    code: doc.code,
    supplierId: doc.supplierId?.toString(),
    items: (doc.items || []).map((item: any) => ({
      productId: item.productId?.toString(),
      variantId: item.variantId?.toString(),
      productName: item.productName,
      variantName: item.variantName,
      quantity: item.quantity,
      importPrice: item.importPrice,
    })),
    totalAmount: doc.totalAmount,
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
