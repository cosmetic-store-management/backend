import { badRequest, notFound } from "../../shared/errors/httpErrors.js";
import * as inventoryRepo from "./inventory.repository.js";
import {
  mapGoodsReceipt,
  type StockItemResponse,
  type TransactionResponse,
  type GoodsReceiptResponse,
} from "./dto/inventory.response.dto.js";
import mongoose from "mongoose";
import Variant from "../product/models/variant.schema.js";

/** Số ký tự cần lấy trong chuỗi ISO để được dạng "yyyy-MM-dd HH:mm" */
const ISO_DATETIME_LENGTH = 16;
/** Khoảng số random cho mã transaction */
const TX_CODE_MIN = 100000;
const TX_CODE_RANGE = 900000;

// ── SUPPLIERS ─────────────────────────────────────────────────────────────────

export const getSuppliers = () => inventoryRepo.findAllSuppliers();

export const createSupplier = async (data: any) => {
  if (!data.name?.trim() || !data.phone?.trim()) {
    throw badRequest("Tên và số điện thoại nhà cung cấp là bắt buộc");
  }
  return inventoryRepo.createSupplier(data);
};

export const updateSupplier = async (id: string, data: any) => {
  const supplier = await inventoryRepo.findSupplierById(id);
  if (!supplier) throw notFound("Supplier not found");

  if (data.name !== undefined) {
    if (!data.name.trim()) throw badRequest("Tên nhà cung cấp không được để trống");
    supplier.name = data.name.trim();
  }
  if (data.phone !== undefined) {
    if (!data.phone.trim()) throw badRequest("Số điện thoại không được để trống");
    supplier.phone = data.phone.trim();
  }
  if (data.email !== undefined) supplier.email = data.email.trim();
  if (data.address !== undefined) supplier.address = data.address.trim();
  if (data.taxCode !== undefined) supplier.taxCode = data.taxCode.trim();
  if (data.contactPerson !== undefined) supplier.contactPerson = data.contactPerson.trim();
  if (data.contactPhone !== undefined) supplier.contactPhone = data.contactPhone.trim();
  if (data.contactEmail !== undefined) supplier.contactEmail = data.contactEmail.trim();
  if (data.contactPosition !== undefined) supplier.contactPosition = data.contactPosition.trim();
  if (data.notes !== undefined) supplier.notes = data.notes.trim();

  if (data.isActive !== undefined) {
    const nextStatus = !!data.isActive;
    if (!nextStatus) {
      const { default: Brand } = await import("../brand/models/brand.schema.js");
      const activeBrandsCount = await Brand.countDocuments({ supplierId: id, isActive: true });
      if (activeBrandsCount > 0) {
        throw badRequest(`Không thể tắt hoạt động nhà cung cấp này vì đang liên kết với ${activeBrandsCount} thương hiệu đang hoạt động.`);
      }
    }
    supplier.isActive = nextStatus;
  }

  await supplier.save();

  const { default: Brand } = await import("../brand/models/brand.schema.js");
  await Brand.updateMany(
    { supplierId: id },
    {
      $set: {
        supplierName: supplier.name,
        contactPhone: supplier.contactPhone || supplier.phone,
        contactEmail: supplier.contactEmail || supplier.email,
      },
    },
  );

  return supplier;
};

export const deleteSupplier = async (id: string) => {
  const supplier = await inventoryRepo.findSupplierById(id);
  if (!supplier) throw notFound("Supplier not found");

  const { default: Brand } = await import("../brand/models/brand.schema.js");
  const linkedBrandsCount = await Brand.countDocuments({ supplierId: id });
  if (linkedBrandsCount > 0) {
    throw badRequest(`Không thể xóa nhà cung cấp này vì đang liên kết với ${linkedBrandsCount} thương hiệu.`);
  }

  const { default: GoodsReceipt } = await import("./models/goods-receipt.schema.js");
  const linkedReceiptsCount = await GoodsReceipt.countDocuments({ supplierId: id });
  if (linkedReceiptsCount > 0) {
    throw badRequest(`Không thể xóa nhà cung cấp này vì đã phát sinh ${linkedReceiptsCount} đơn nhập hàng.`);
  }

  await supplier.deleteOne();
};

// ── STOCK ─────────────────────────────────────────────────────────────────────

export const getStockList = async (
  search?: string,
  page = 1,
  limit = 10,
  stockStatus?: string,
): Promise<{
  stock: StockItemResponse[];
  pagination: {
    limit: number;
    totalItems: number;
    page: number;
    totalPages: number;
  };
}> => {
  const query: Record<string, any> = {};

  if (search) {
    const productIds = await inventoryRepo.findProductIdsByName(search);
    query.$or = [
      { name: { $regex: search.trim(), $options: "i" } },
      { sku: { $regex: search.trim(), $options: "i" } },
      { productId: { $in: productIds } },
    ];
  }

  if (stockStatus === "low") {
    query.$expr = { $lte: ["$stock", "$minStock"] };
  } else if (stockStatus === "out") {
    query.stock = 0;
  } else if (stockStatus === "in") {
    query.$expr = { $gt: ["$stock", "$minStock"] };
  }

  const [result, totalItems] = await Promise.all([
    inventoryRepo.findVariantsByQuery(query, page, limit),
    inventoryRepo.countVariantsByQuery(query),
  ]);
  const variants = result.variants;

  const variantIds = variants.map((v) => v._id);
  const activeBatches = await inventoryRepo.findActiveBatchesByVariants(variantIds);
  const currentCostMap = new Map<string, {cost: number, mfgDate: any, expDate: any}>();
  const expiringBatchesMap = new Map<string, number>();
  
  for (const vId of variantIds) {
    const vBatches = activeBatches.filter((b) => b.variantId.toString() === vId.toString());
    
    // FIFO: Lấy giá nhập, NSX, HSD của lô cũ nhất đang xuất
    const currentCost = vBatches.length > 0 ? vBatches[0].importPrice : 0;
    const currentMfgDate = vBatches.length > 0 ? vBatches[0].manufactureDate : null;
    const currentExpDate = vBatches.length > 0 ? vBatches[0].expiryDate : null;
    currentCostMap.set(vId.toString(), {
      cost: currentCost,
      mfgDate: currentMfgDate,
      expDate: currentExpDate
    });
    
    // Cảnh báo các lô sắp hết hạn (< 3 tháng)
    const expiringCount = vBatches.filter((b: any) => b.expiryDate && new Date(b.expiryDate).getTime() <= Date.now() + 90 * 24 * 60 * 60 * 1000).length;
    expiringBatchesMap.set(vId.toString(), expiringCount);
  }

  const stock: StockItemResponse[] = variants.map((v) => {
    const prod = v.productId as any;
    const brand = prod?.brandId as any;
    return {
      id: v._id.toString(),
      name: v.name.includes("Default Title") ? (prod?.name || "Unknown") : `${prod?.name || "Unknown"} - ${v.name}`,
      sku: v.sku,
      barcode: v.barcode,
      productImage: prod?.imageUrl || prod?.imageUrls?.[0] || "",
      stock: v.stock,
      minStock: v.minStock ?? 0,
      mac: currentCostMap.get(v._id.toString())?.cost || 0,
      manufactureDate: currentCostMap.get(v._id.toString())?.mfgDate
        ? new Date(currentCostMap.get(v._id.toString())!.mfgDate!).toISOString().substring(0, 10)
        : undefined,
      expiryDate: currentCostMap.get(v._id.toString())?.expDate
        ? new Date(currentCostMap.get(v._id.toString())!.expDate!).toISOString().substring(0, 10)
        : undefined,
      brandId: brand?._id?.toString() ?? "",
      brandName: brand?.name ?? prod?.brand ?? "",
      brandImage: brand?.imageUrl ?? "",
      supplier: brand?.supplierId && typeof brand.supplierId === "object" && "name" in brand.supplierId
        ? (brand.supplierId as any).name
        : (brand?.name ?? prod?.brand ?? ""),
      lastUpdated: (v as any).updatedAt
        ? new Date((v as any).updatedAt)
            .toISOString()
            .replace("T", " ")
            .substring(0, ISO_DATETIME_LENGTH)
        : "",
      expiringBatchesCount: expiringBatchesMap.get(v._id.toString()) || 0,
      supplierInfo: brand?.supplierId && typeof brand.supplierId === "object" && "name" in brand.supplierId
        ? {
            id: (brand.supplierId as any)._id?.toString() || (brand.supplierId as any).id?.toString(),
            name: (brand.supplierId as any).name,
            phone: (brand.supplierId as any).phone,
            email: (brand.supplierId as any).email || "",
            address: (brand.supplierId as any).address || "",
          }
        : undefined,
    };
  });

  return {
    stock,
    pagination: {
      limit,
      totalItems,
      page: result.page,
      totalPages: result.totalPages,
    },
  };
};

// ── TRANSACTIONS ──────────────────────────────────────────────────────────────

export const getTransactions = async (
  page = 1,
  limit: number,
  type?: string,
): Promise<{
  transactions: TransactionResponse[];
  pagination: {
    limit: number;
    totalItems: number;
    page: number;
    totalPages: number;
  };
}> => {
  const [result, totalItems] = await Promise.all([
    inventoryRepo.findTransactions(page, limit, type),
    inventoryRepo.countTransactions(type),
  ]);
  const txs = result.transactions;

  const transactions: TransactionResponse[] = txs.map((tx) => {
    const variant = tx.variantId as any;
    return {
      id: tx.code,
      sku: variant?.sku ?? "N/A",
      type: tx.type as "in" | "out" | "adjustment",
      qty: tx.qty,
      user: (tx.creatorId as any)?.name ?? "N/A",
      date: tx.date
        ? new Date(tx.date)
            .toISOString()
            .replace("T", " ")
            .substring(0, ISO_DATETIME_LENGTH)
        : "",
    };
  });

  return {
    transactions,
    pagination: {
      limit,
      totalItems,
      page: result.page,
      totalPages: result.totalPages,
    },
  };
};

// ── BATCHES ───────────────────────────────────────────────────────────────────

export const getVariantBatches = async (variantId: string) => {
  return await inventoryRepo.findActiveBatchesByVariant(variantId);
};

export const updateBatch = async (batchId: string, data: any) => {
  const batch = await inventoryRepo.updateBatchInfo(batchId, data);
  if (!batch) throw notFound("Batch not found");
  return batch;
};

// ── GOODS RECEIPTS ────────────────────────────────────────────────────────────

export const createGoodsReceipt = async (
  operator: any,
  data: any,
): Promise<GoodsReceiptResponse> => {
  const { supplierId, items } = data;
  if (!supplierId) throw badRequest("supplierId is required");
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw badRequest("Import order must have at least one product");
  }

  const supplier = await inventoryRepo.findSupplierById(supplierId);
  if (!supplier) throw notFound("Supplier not found");
  if (!supplier.isActive) {
    throw badRequest("Nhà cung cấp này đang tạm ngưng hoạt động, không thể nhập hàng.");
  }

  let totalAmount = 0;
  const receiptItems = [];
  const { ObjectId } = mongoose.Types;

  for (const item of items) {
    const { variantId, quantity, importPrice, batchCode, manufactureDate, expiryDate } = item;
    if (
      !variantId ||
      !quantity ||
      quantity <= 0 ||
      !importPrice ||
      importPrice <= 0
    ) {
      throw badRequest("Invalid inventory item information");
    }

    const variant = await inventoryRepo.findVariantById(variantId);
    if (!variant) throw notFound(`Variant ${variantId} not found`);

    const product = await inventoryRepo.findProductById(
      variant.productId.toString(),
    );
    if (!product)
      throw notFound(`Product for variant ${variantId} not found`);

    totalAmount += importPrice * quantity;
    receiptItems.push({
      productId: variant.productId,
      variantId: new ObjectId(variantId),
      productName: product.name,
      variantName: variant.name,
      quantity,
      importPrice,
      batchCode,
      manufactureDate,
      expiryDate,
    });
  }

  const receiptCode = `GR-${Date.now()}`;
  let receipt: any = null;

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    receipt = await inventoryRepo.createGoodsReceipt(
      {
        code: receiptCode,
        supplierId: supplier._id,
        items: receiptItems,
        totalAmount,
        creatorId: operator._id,
      },
      session,
    );

    // Cộng tồn kho + ghi transaction cho từng dòng hàng
    for (const item of receiptItems) {
      const variant = await inventoryRepo.findVariantById(
        item.variantId.toString(),
      );
      if (variant) {
        await inventoryRepo.atomicUpdateStock(
          variant._id,
          item.quantity,
          session,
        );

        await inventoryRepo.createTransaction(
          {
            code: `TXIN${Math.floor(TX_CODE_MIN + Math.random() * TX_CODE_RANGE)}`,
            productId: item.productId,
            variantId: item.variantId,
            type: "in",
            qty: item.quantity,
            creatorId: operator._id,
            date: new Date(),
          },
          session,
        );

        await inventoryRepo.createBatch(
          {
            variantId: item.variantId,
            goodsReceiptId: receipt._id,
            batchCode: item.batchCode,
            manufactureDate: item.manufactureDate,
            expiryDate: item.expiryDate,
            importPrice: item.importPrice,
            originalQty: item.quantity,
            remainingQty: item.quantity,
          },
          session,
        );
      }
    }

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }

  return mapGoodsReceipt(receipt);
};

// ── ADJUST STOCK (KIỂM KHO) ──────────────────────────────────────────────────

export const adjustStock = async (
  operator: any,
  data: any,
): Promise<any> => {
  const { variantId, actualStock, minStock } = data;

  const variant = await inventoryRepo.findVariantById(variantId);
  if (!variant) throw notFound(`Không tìm thấy biến thể ${variantId}`);

  let diff = actualStock !== undefined ? actualStock - variant.stock : 0;
  let isMinStockChanged = minStock !== undefined && variant.minStock !== minStock;

  if (diff === 0 && !isMinStockChanged) return variant; // Không thay đổi, bỏ qua

  let updatedVariant: any = null;

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    updatedVariant = await inventoryRepo.atomicUpdateStock(
      variant._id,
      diff,
      session,
    );

    if (diff < 0) {
      await inventoryRepo.deductBatchesFIFO(variant._id, Math.abs(diff), session);
    } else if (diff > 0) {
      const importPrice = Math.round(variant.price * 0.6);
      await inventoryRepo.createBatch(
        {
          variantId: variant._id,
          goodsReceiptId: null,
          importPrice,
          originalQty: diff,
          remainingQty: diff,
        },
        session
      );
    }

    if (isMinStockChanged) {
      await Variant.updateOne(
        { _id: variant._id },
        { $set: { minStock } },
        { session }
      );
      if (updatedVariant) {
        updatedVariant.minStock = minStock;
      }
    }

    await inventoryRepo.createTransaction(
      {
        code: `TXADJ${Math.floor(TX_CODE_MIN + Math.random() * TX_CODE_RANGE)}`,
        productId: variant.productId,
        variantId: variant._id,
        type: "adjustment",
        qty: diff, // có thể âm (giảm) hoặc dương (tăng)
        creatorId: operator._id,
        date: new Date(),
      },
      session,
    );

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }

  return updatedVariant;
};

// ── UPDATE MIN STOCK ────────────────────────────────────────────────────────
export const updateMinStock = async (operator: any, data: any) => {
  const { variantId, minStock } = data;

  const variant = await Variant.findById(variantId);
  if (!variant) throw new Error("Product not found");

  variant.minStock = minStock;
  await variant.save();

  return variant;
};

import { sendLowStockAlertEmail } from "../../shared/email/email.service.js";
import User from "../user/models/user.schema.js";

export const checkAndTriggerLowStockAlert = async (variant: any) => {
  if (!variant || variant.stock > variant.minStock) return;

  try {
    // Find active store owners and managers to notify
    const managers = await User.find({
      role: { $in: ["owner", "manager"] },
      isActive: true,
      isDeleted: { $ne: true }
    }).select("email").lean();

    const emails = managers.map(m => m.email).filter(Boolean) as string[];
    if (emails.length === 0) return;

    for (const email of emails) {
      await sendLowStockAlertEmail(email, variant.name, variant.stock, variant.minStock);
    }
    console.log(`[Low Stock Alert] Emailed low stock alert for variant ${variant.name} (Stock: ${variant.stock}/${variant.minStock})`);
  } catch (error) {
    console.error("[Low Stock Alert] Failed to trigger low-stock alert:", error);
  }
};
