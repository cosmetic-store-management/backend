import { sendLowStockAlertEmail } from "../../../shared/email/email.service.js";
import User from "../../identity/user/models/user.schema.js";
import { badRequest, notFound } from "../../../shared/errors/httpErrors.js";
import { injectable, inject } from "tsyringe";
import { InventoryRepository } from "./inventory.repository.js";
import {
  mapGoodsReceipt,
  mapStocktake,
  type StockItemResponse,
  type TransactionResponse,
  type GoodsReceiptResponse,
  type StocktakeResponse,
  type PaginationMeta,
} from "./dto/inventory.response.dto.js";
import mongoose from "mongoose";
import Variant from "../product/models/variant.schema.js";

/** Số ký tự cần lấy trong chuỗi ISO để được dạng "yyyy-MM-dd HH:mm" */
const ISO_DATETIME_LENGTH = 16;
/** Khoảng số random cho mã transaction */
const TX_CODE_MIN = 100000;
const TX_CODE_RANGE = 900000;

// ── SUPPLIERS ─────────────────────────────────────────────────────────────────

import { eventBus } from "../../shared/event-bus/index.js";
import InventoryTransaction from "./models/inventory-transaction.schema.js";
import { logger } from "../../../shared/logger/index.js";

import { BrandRepository } from "../brand/brand.repository.js";

@injectable()
export class InventoryService {
  constructor(
    @inject(InventoryRepository) private readonly inventoryRepo: InventoryRepository,
    @inject(BrandRepository) private readonly brandRepo: BrandRepository
  ) {
    eventBus.on("inventory.stock.decremented", (variant: any) => {
      this.checkAndTriggerLowStockAlert(variant).catch(err => 
        logger.error({ err: err }, "Error handling inventory.stock.decremented:")
      );
    });

    eventBus.on("inventory.stock.restored", async (payload: any) => {
      try {
        const { variantId, productId, quantity, avgCostPrice, price, operatorId, session } = payload;
        
        await this.inventoryRepo.createBatch(
          {
            variantId,
            goodsReceiptId: null,
            importPrice: avgCostPrice,
            originalQty: quantity,
            remainingQty: quantity,
          },
          session
        );

        await InventoryTransaction.create([{
          code: `TXRET${Math.floor(100000 + Math.random() * 900000)}`,
          productId,
          variantId,
          type: "in",
          qty: quantity,
          price: avgCostPrice || price || 0,
          creatorId: operatorId || "60c72b2f9b1d8b2c8c8b4567",
          date: new Date(),
        }], { session });
      } catch (error) {
        logger.error({ err: error }, "Error handling inventory.stock.restored:");
      }
    });

    eventBus.on("inventory.stock.deducted", async (payload: any) => {
      try {
        const { variantId, productId, quantity, price, operatorId, session } = payload;
        
        await InventoryTransaction.create([{
          code: `TXOUT${Math.floor(100000 + Math.random() * 900000)}`,
          productId,
          variantId,
          type: "out",
          qty: quantity,
          price: price,
          creatorId: operatorId || "60c72b2f9b1d8b2c8c8b4567",
          date: new Date(),
        }], { session });
      } catch (error) {
        logger.error({ err: error }, "Error handling inventory.stock.deducted:");
      }
    });
  }

  deductBatchesFIFO = (variantId: string, quantity: number, session?: mongoose.ClientSession) => {
    return this.inventoryRepo.deductBatchesFIFO(variantId, quantity, session);
  };

  getSuppliers = () => this.inventoryRepo.findAllSuppliers();

  createSupplier = async (data: any) => {
  if (!data.name?.trim() || !data.phone?.trim()) {
    throw badRequest("Tên và số điện thoại nhà cung cấp là bắt buộc");
  }
  return this.inventoryRepo.createSupplier(data);
};

  updateSupplier = async (id: string, data: any) => {
  const supplier = await this.inventoryRepo.findSupplierById(id);
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
      const activeBrandsCount = await this.brandRepo.countBySupplierId(id, true);
      if (activeBrandsCount > 0) {
        throw badRequest(`Không thể tắt hoạt động nhà cung cấp này vì đang liên kết với ${activeBrandsCount} thương hiệu đang hoạt động.`);
      }
    }
    supplier.isActive = nextStatus;
  }

  await supplier.save();

  await this.brandRepo.updateSupplierInfo(id, {
    supplierName: supplier.name,
    contactPhone: supplier.contactPhone || supplier.phone,
    contactEmail: supplier.contactEmail || supplier.email,
  });

  return supplier;
};

  deleteSupplier = async (id: string) => {
  const supplier = await this.inventoryRepo.findSupplierById(id);
  if (!supplier) throw notFound("Supplier not found");

  const linkedBrandsCount = await this.brandRepo.countBySupplierId(id);
  if (linkedBrandsCount > 0) {
    throw badRequest(`Không thể xóa nhà cung cấp này vì đang liên kết với ${linkedBrandsCount} thương hiệu.`);
  }

  const linkedReceiptsCount = await this.inventoryRepo.countGoodsReceiptsBySupplierId(id);
  if (linkedReceiptsCount > 0) {
    throw badRequest(`Không thể xóa nhà cung cấp này vì đã phát sinh ${linkedReceiptsCount} đơn nhập hàng.`);
  }

  await supplier.deleteOne();
};

// ── STOCK ─────────────────────────────────────────────────────────────────────

  getStockList = async (
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
    const productIds = await this.inventoryRepo.findProductIdsByName(search);
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
  } else if (stockStatus === "expiring") {
    const { default: Batch } = await import("./models/batch.schema.js");
    const expiringDateThreshold = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const expiringBatches = await Batch.find({
      remainingQty: { $gt: 0 },
      expiryDate: { $lte: expiringDateThreshold },
    })
      .select("variantId")
      .lean();
    const variantIds = expiringBatches.map((b) => b.variantId);
    query._id = { $in: variantIds };
  }

  const [result, totalItems] = await Promise.all([
    this.inventoryRepo.findVariantsByQuery(query, page, limit),
    this.inventoryRepo.countVariantsByQuery(query),
  ]);
  const variants = result.variants;

  const variantIds = variants.map((v) => v._id);
  const activeBatches = await this.inventoryRepo.findActiveBatchesByVariants(variantIds);
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

  getInventoryStats = async () => {
  const [totalSKUs, outOfStock, lowStock, totalValue] = await Promise.all([
    this.inventoryRepo.countTotalSKUs(),
    this.inventoryRepo.countOutOfStock(),
    this.inventoryRepo.countLowStock(),
    this.inventoryRepo.aggregateTotalInventoryValue(),
  ]);

  return {
    totalSKUs,
    totalValue,
    outOfStock,
    lowStock,
  };
};

// ── TRANSACTIONS ──────────────────────────────────────────────────────────────

  getTransactions = async (
  page = 1,
  limit: number,
  type?: string,
  variantId?: string,
): Promise<{
  transactions: TransactionResponse[];
  pagination: {
    limit: number;
    totalItems: number;
    page: number;
    totalPages: number;
  };
}> => {
  const result = await this.inventoryRepo.findTransactions(page, limit, type, variantId);
  const txs = result.transactions;
  const totalItems = result.total;

  const transactions: TransactionResponse[] = txs.map((tx) => {
    const variant = tx.variantId as any;
    const prod = variant?.productId as any;
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
      productName: prod?.name ?? "N/A",
      productImage: prod?.imageUrl || prod?.imageUrls?.[0] || "",
      barcode: variant?.barcode || "",
      price: tx.price || Math.round((variant?.price || 0) * 0.6),
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

  getVariantBatches = async (variantId: string) => {
  return await this.inventoryRepo.findActiveBatchesByVariant(variantId);
};

  updateBatch = async (batchId: string, data: any) => {
  const { default: Batch } = await import("./models/batch.schema.js");
  const { default: GoodsReceipt } = await import("./models/goods-receipt.schema.js");
  const { default: InventoryTransaction } = await import("./models/inventory-transaction.schema.js");

  const session = await mongoose.startSession();
  let updatedBatch: any = null;

  try {
    session.startTransaction();

    const oldBatch = await Batch.findById(batchId).session(session);
    if (!oldBatch) throw notFound("Batch not found");

    const newImportPrice = Number(data.importPrice);
    const newOriginalQty = Number(data.originalQty);

    const priceChanged = !isNaN(newImportPrice) && newImportPrice !== oldBatch.importPrice;
    const qtyChanged = !isNaN(newOriginalQty) && newOriginalQty !== oldBatch.originalQty;

    let qtyDiff = 0;

    if (qtyChanged) {
      qtyDiff = newOriginalQty - oldBatch.originalQty;
      if (oldBatch.remainingQty + qtyDiff < 0) {
        throw badRequest(
          `Không thể giảm số lượng nhập xuống thấp hơn số lượng còn lại đang có trong lô (còn lại: ${oldBatch.remainingQty})`
        );
      }
      
      // Update variant's total stock
      await this.inventoryRepo.atomicUpdateStock(oldBatch.variantId, qtyDiff, session);

      // Set remainingQty in update data
      data.remainingQty = oldBatch.remainingQty + qtyDiff;
    }

    // 1. Update GoodsReceipt if linked
    if (oldBatch.goodsReceiptId && (priceChanged || qtyChanged)) {
      const receipt = await GoodsReceipt.findById(oldBatch.goodsReceiptId).session(session);
      if (receipt) {
        const item = receipt.items.find(
          (i: any) => i.variantId.toString() === oldBatch.variantId.toString()
        );
        if (item) {
          if (priceChanged) item.importPrice = newImportPrice;
          if (qtyChanged) item.quantity = newOriginalQty;

          // Recalculate total amount
          receipt.totalAmount = receipt.items.reduce(
            (sum: number, i: any) => sum + i.quantity * i.importPrice,
            0
          );
          await receipt.save({ session });
        }
      }
    }

    // 2. Update corresponding InventoryTransaction
    if (priceChanged || qtyChanged) {
      const transaction = await InventoryTransaction.findOne({
        variantId: oldBatch.variantId,
        type: "in",
        qty: oldBatch.originalQty,
        price: oldBatch.importPrice,
      }).session(session);

      if (transaction) {
        if (priceChanged) transaction.price = newImportPrice;
        if (qtyChanged) transaction.qty = newOriginalQty;
        await transaction.save({ session });
      }
    }

    // 3. Update the batch itself
    updatedBatch = await Batch.findByIdAndUpdate(
      batchId,
      { $set: data },
      { new: true, session }
    );

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }

  return updatedBatch;
};

// ── GOODS RECEIPTS ────────────────────────────────────────────────────────────

  createGoodsReceipt = async (
  operator: any,
  data: any,
): Promise<GoodsReceiptResponse> => {
  const { supplierId, items } = data;
  if (!supplierId) throw badRequest("supplierId is required");
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw badRequest("Import order must have at least one product");
  }

  const supplier = await this.inventoryRepo.findSupplierById(supplierId);
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

    const variant = await this.inventoryRepo.findVariantById(variantId);
    if (!variant) throw notFound(`Variant ${variantId} not found`);

    const product = await this.inventoryRepo.findProductById(
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

  const receiptCode = `GR${Math.floor(TX_CODE_MIN + Math.random() * TX_CODE_RANGE)}`;
  let receipt: any = null;

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    receipt = await this.inventoryRepo.createGoodsReceipt(
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
      const variant = await this.inventoryRepo.findVariantById(
        item.variantId.toString(),
      );
      if (variant) {
        await this.inventoryRepo.atomicUpdateStock(
          variant._id,
          item.quantity,
          session,
        );

        await this.inventoryRepo.createTransaction(
          {
            code: `TXIN${Math.floor(TX_CODE_MIN + Math.random() * TX_CODE_RANGE)}`,
            productId: item.productId,
            variantId: item.variantId,
            type: "in",
            qty: item.quantity,
            price: item.importPrice,
            creatorId: operator._id,
            date: new Date(),
          },
          session,
        );

        await this.inventoryRepo.createBatch(
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

  adjustStock = async (
  operator: any,
  data: any,
): Promise<any> => {
  const { variantId, actualStock, minStock } = data;

  const variant = await this.inventoryRepo.findVariantById(variantId);
  if (!variant) throw notFound(`Không tìm thấy biến thể ${variantId}`);

  let diff = actualStock !== undefined ? actualStock - variant.stock : 0;
  let isMinStockChanged = minStock !== undefined && variant.minStock !== minStock;

  if (diff === 0 && !isMinStockChanged) return variant; // Không thay đổi, bỏ qua

  let updatedVariant: any = null;

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    updatedVariant = await this.inventoryRepo.atomicUpdateStock(
      variant._id,
      diff,
      session,
    );

    let importPrice = data.costPrice;
    if (!importPrice) {
      const activeBatches = await this.inventoryRepo.findActiveBatchesByVariants([variant._id]);
      if (activeBatches && activeBatches.length > 0) {
        importPrice = activeBatches[0].importPrice;
      } else {
        importPrice = Math.round(variant.price * 0.6);
      }
    }

    if (diff < 0) {
      await this.inventoryRepo.deductBatchesFIFO(variant._id, Math.abs(diff), session);
    } else if (diff > 0) {
      await this.inventoryRepo.createBatch(
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

    await this.inventoryRepo.createTransaction(
      {
        code: `TXADJ${Math.floor(TX_CODE_MIN + Math.random() * TX_CODE_RANGE)}`,
        productId: variant.productId,
        variantId: variant._id,
        type: "adjustment",
        qty: diff, // có thể âm (giảm) hoặc dương (tăng)
        price: importPrice,
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

// ── GOODS RECEIPTS QUERY & DETAIL ─────────────────────────────────────────────

  getGoodsReceipts = async (
  page = 1,
  limit = 10,
  search?: string,
): Promise<{ receipts: GoodsReceiptResponse[]; pagination: PaginationMeta }> => {
  const query: any = {};
  if (search) {
    query.code = { $regex: new RegExp(search, "i") };
  }
  const result = await this.inventoryRepo.findGoodsReceipts(page, limit, query);
  return {
    receipts: result.receipts.map(mapGoodsReceipt),
    pagination: {
      page: result.page,
      limit: result.limit,
      totalItems: result.total,
      totalPages: result.totalPages,
    },
  };
};

  getGoodsReceiptDetail = async (id: string): Promise<GoodsReceiptResponse> => {
  const doc = await this.inventoryRepo.findGoodsReceiptById(id);
  if (!doc) throw notFound("Goods receipt not found");
  return mapGoodsReceipt(doc);
};

// ── STOCKTAKES (KIỂM KHO HÀNG LOẠT VÀ CÂN BẰNG) ───────────────────────────────

  getStocktakes = async (
  page = 1,
  limit = 10,
  search?: string,
): Promise<{ stocktakes: StocktakeResponse[]; pagination: PaginationMeta }> => {
  const query: any = {};
  if (search) {
    query.code = { $regex: new RegExp(search, "i") };
  }
  const result = await this.inventoryRepo.findStocktakes(page, limit, query);
  return {
    stocktakes: result.stocktakes.map(mapStocktake),
    pagination: {
      page: result.page,
      limit: result.limit,
      totalItems: result.total,
      totalPages: result.totalPages,
    },
  };
};

  getStocktakeDetail = async (id: string): Promise<StocktakeResponse> => {
  const doc = await this.inventoryRepo.findStocktakeById(id);
  if (!doc) throw notFound("Stocktake record not found");
  return mapStocktake(doc);
};

  createStocktake = async (
  operator: any,
  data: any,
): Promise<StocktakeResponse> => {
  const { items, notes } = data;
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw badRequest("Stocktake must have at least one product");
  }

  const { ObjectId } = mongoose.Types;
  const stocktakeItems = [];
  let totalVarianceQty = 0;
  let totalAdjustmentValue = 0;

  for (const item of items) {
    const { variantId, actualQty } = item;
    if (variantId === undefined || actualQty === undefined || actualQty < 0) {
      throw badRequest("Invalid stocktake item parameters");
    }

    const variant = await this.inventoryRepo.findVariantById(variantId);
    if (!variant) throw notFound(`Variant ${variantId} not found`);

    const product = await this.inventoryRepo.findProductById(variant.productId.toString());
    if (!product) throw notFound(`Product for variant ${variantId} not found`);

    const systemQty = variant.stock;
    const variance = actualQty - systemQty;

    const activeBatches = await this.inventoryRepo.findActiveBatchesByVariant(variantId);
    const costPrice = activeBatches.length > 0 ? activeBatches[0].importPrice : Math.round(variant.price * 0.6);
    const adjustmentValue = variance * costPrice;

    totalVarianceQty += variance;
    totalAdjustmentValue += adjustmentValue;

    stocktakeItems.push({
      productId: variant.productId,
      variantId: new ObjectId(variantId),
      productName: product.name,
      variantName: variant.name,
      systemQty,
      actualQty,
      variance,
      costPrice,
    });
  }

  const stocktakeCode = `STK${Math.floor(TX_CODE_MIN + Math.random() * TX_CODE_RANGE)}`;
  let stocktake: any = null;

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    // Create Stocktake document
    stocktake = await this.inventoryRepo.createStocktake(
      {
        code: stocktakeCode,
        items: stocktakeItems,
        totalVarianceQty,
        totalAdjustmentValue,
        creatorId: operator._id,
        notes,
      },
      session,
    );

    // Perform adjustments and log transactions
    for (const item of stocktakeItems) {
      if (item.variance !== 0) {
        // Update Stock level
        await this.inventoryRepo.atomicUpdateStock(
          item.variantId,
          item.variance, // could be negative or positive
          session,
        );

        // Log transaction
        await this.inventoryRepo.createTransaction(
          {
            code: `TXADJ${Math.floor(TX_CODE_MIN + Math.random() * TX_CODE_RANGE)}`,
            productId: item.productId,
            variantId: item.variantId,
            type: "adjustment",
            qty: item.variance,
            price: item.costPrice,
            creatorId: operator._id,
            date: new Date(),
          },
          session,
        );

        // If variance is negative, deduct batches (FIFO)
        if (item.variance < 0) {
          await this.inventoryRepo.deductBatchesFIFO(
            item.variantId,
            Math.abs(item.variance),
            session,
          );
        } else {
          // If variance is positive, create a dummy batch to balance stock
          await this.inventoryRepo.createBatch(
            {
              variantId: item.variantId,
              goodsReceiptId: null,
              importPrice: item.costPrice,
              originalQty: item.variance,
              remainingQty: item.variance,
            },
            session,
          );
        }
      }
    }

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }

  // Populate creator details for mapping
  const populatedStocktake = await this.inventoryRepo.findStocktakeById(stocktake._id);
  return mapStocktake(populatedStocktake);
};

// ── UPDATE MIN STOCK ────────────────────────────────────────────────────────
  updateMinStock = async (operator: any, data: any) => {
  const { variantId, minStock } = data;

  const variant = await Variant.findById(variantId);
  if (!variant) throw new Error("Product not found");

  variant.minStock = minStock;
  await variant.save();

  return variant;
};




  checkAndTriggerLowStockAlert = async (variant: any) => {
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
    logger.info(`[Low Stock Alert] Emailed low stock alert for variant ${variant.name} (Stock: ${variant.stock}/${variant.minStock})`);
  } catch (error) {
    logger.error({ err: error }, "[Low Stock Alert] Failed to trigger low-stock alert:");
  }
};

}
