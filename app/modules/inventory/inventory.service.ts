import { badRequest, notFound } from "../../shared/errors/httpErrors.js";
import * as inventoryRepo from "./inventory.repository.js";

// ── SUPPLIERS ─────────────────────────────────────────────────────────────────

export const getSuppliers = () => inventoryRepo.findAllSuppliers();

export const createSupplier = async (data: any) => {
  if (!data.name?.trim() || !data.phone?.trim()) {
    throw badRequest("Tên và số điện thoại nhà cung cấp là bắt buộc");
  }
  return inventoryRepo.createSupplier(data);
};

// ── STOCK ─────────────────────────────────────────────────────────────────────

export const getStockList = async (search?: string, page = 1, limit = 10) => {
  const query: Record<string, any> = {};

  if (search) {
    const productIds = await inventoryRepo.findProductIdsByName(search);
    query.$or = [
      { name:      { $regex: search.trim(), $options: "i" } },
      { sku:       { $regex: search.trim(), $options: "i" } },
      { productId: { $in: productIds } }
    ];
  }

  const skip = (page - 1) * limit;
  const [variants, totalItems] = await Promise.all([
    inventoryRepo.findVariantsByQuery(query, skip, limit),
    inventoryRepo.countVariantsByQuery(query)
  ]);

  const stock = variants.map((v) => {
    const prod  = v.productId as any;
    const brand = prod?.brandId as any;
    return {
      id:          v._id.toString(),
      name:        `${prod?.name || "Unknown"} - ${v.name}`,
      sku:         v.sku,
      barcode:     v.barcode,
      stock:       v.stock,
      minStock:    v.minStock ?? 10,
      brandId:     brand?._id?.toString() ?? "",
      brandName:   brand?.name ?? prod?.brand ?? "",
      brandImage:  brand?.imageUrl ?? "",
      supplier:    brand?.name ?? prod?.brand ?? "",
      lastUpdated: (v as any).updatedAt
        ? new Date((v as any).updatedAt).toISOString().replace("T", " ").substring(0, 16)
        : "",
    };
  });

  return {
    stock,
    pagination: { page, limit, totalPages: Math.ceil(totalItems / limit), totalItems }
  };
};

// ── TRANSACTIONS ──────────────────────────────────────────────────────────────

export const getTransactions = async (page = 1, limit = 10) => {
  const skip = (page - 1) * limit;
  const [txs, totalItems] = await Promise.all([
    inventoryRepo.findTransactions(skip, limit),
    inventoryRepo.countTransactions()
  ]);

  const transactions = txs.map((tx) => {
    const variant = tx.variantId as any;
    return {
      id:   tx.code,
      sku:  variant?.sku ?? "N/A",
      type: tx.type,
      qty:  tx.qty,
      user: (tx.creatorId as any)?.name ?? "N/A",
      date: tx.date
        ? new Date(tx.date).toISOString().replace("T", " ").substring(0, 16)
        : "",
    };
  });

  return {
    transactions,
    pagination: { page, limit, totalPages: Math.ceil(totalItems / limit), totalItems }
  };
};

// ── GOODS RECEIPTS ────────────────────────────────────────────────────────────

export const createGoodsReceipt = async (operator: any, data: any) => {
  const { supplierId, items } = data;
  if (!supplierId) throw badRequest("supplierId là bắt buộc");
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw badRequest("Đơn nhập hàng phải có ít nhất một sản phẩm");
  }

  const supplier = await inventoryRepo.findSupplierById(supplierId);
  if (!supplier) throw notFound("Không tìm thấy nhà cung cấp");

  let totalAmount = 0;
  const receiptItems = [];
  const { Types: { ObjectId } } = await import("mongoose");

  for (const item of items) {
    const { variantId, quantity, importPrice } = item;
    if (!variantId || !quantity || quantity <= 0 || !importPrice || importPrice <= 0) {
      throw badRequest("Thông tin sản phẩm nhập kho không hợp lệ");
    }

    const variant = await inventoryRepo.findVariantById(variantId);
    if (!variant) throw notFound(`Không tìm thấy biến thể ${variantId}`);

    const product = await inventoryRepo.findProductById(variant.productId.toString());
    if (!product) throw notFound(`Không tìm thấy sản phẩm của biến thể ${variantId}`);

    totalAmount += importPrice * quantity;
    receiptItems.push({
      productId: variant.productId,
      variantId: new ObjectId(variantId),
      productName: product.name,
      variantName: variant.name,
      quantity,
      importPrice,
    });
  }

  const receiptCode = `GR-${Date.now()}`;
  const receipt = await inventoryRepo.createGoodsReceipt({
    code:        receiptCode,
    supplierId:  supplier._id,
    items:       receiptItems,
    totalAmount,
    creatorId:   operator._id,
  });

  // Cộng tồn kho + ghi transaction
  for (const item of receiptItems) {
    const variant = await inventoryRepo.findVariantById(item.variantId.toString());
    if (variant) {
      variant.stock += item.quantity;
      await inventoryRepo.saveVariant(variant);

      await inventoryRepo.createTransaction({
        code:      `TX-GR-${Math.floor(100000 + Math.random() * 900000)}`,
        productId: item.productId,
        variantId: item.variantId,
        type:      "in",
        qty:       item.quantity,
        creatorId: operator._id,
        date:      new Date(),
      });
    }
  }

  return receipt;
};

// ── ADJUST STOCK (KIỂM KHO) ──────────────────────────────────────────────────

export const adjustStock = async (operator: any, data: any) => {
  const { variantId, actualStock, reason } = data;

  if (!variantId || actualStock === undefined || actualStock < 0) {
    throw badRequest("Dữ liệu kiểm kho không hợp lệ");
  }

  const variant = await inventoryRepo.findVariantById(variantId);
  if (!variant) throw notFound(`Không tìm thấy biến thể ${variantId}`);

  const diff = actualStock - variant.stock;
  if (diff === 0) return variant; // No change

  variant.stock = actualStock;
  await inventoryRepo.saveVariant(variant);

  await inventoryRepo.createTransaction({
    code:      `TX-ADJ-${Math.floor(100000 + Math.random() * 900000)}`,
    productId: variant.productId,
    variantId: variant._id,
    type:      "adjustment",
    qty:       diff, // có thể âm hoặc dương
    creatorId: operator._id,
    date:      new Date(),
  });

  return variant;
};
