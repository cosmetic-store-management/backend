import { injectable, container } from "tsyringe";
import mongoose from "mongoose";
import Product from "../product/models/product.schema.js";
import Variant from "../product/models/variant.schema.js";
import Supplier from "./models/supplier.schema.js";
import GoodsReceipt from "./models/goods-receipt.schema.js";
import InventoryTransaction from "./models/inventory-transaction.schema.js";
import Batch from "./models/batch.schema.js";
import Stocktake from "./models/stocktake.schema.js";

@injectable()
export class InventoryRepository {
  findAllSuppliers() {
    return Supplier.find().sort({ name: 1 }).lean();
  }

  findSupplierById(id: string) {
    return Supplier.findById(id);
  }

  createSupplier(data: any) {
    return Supplier.create(data);
  }

  async findVariantsByQuery(query: Record<string, any>, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [variants, total] = await Promise.all([
      Variant.find(query)
        .populate({
          path: "productId",
          populate: {
            path: "brandId",
            select: "name slug imageUrl country supplierId",
            populate: { path: "supplierId" },
          },
        })
        .sort({ _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Variant.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);

    return { variants, total, limit, page, totalPages };
  }

  countVariantsByQuery(query: Record<string, any>) {
    return Variant.countDocuments(query);
  }

  findVariantById(id: string) {
    return Variant.findById(id);
  }

  findProductById(id: string) {
    return Product.findById(id);
  }

  saveVariant(variant: any) {
    return variant.save();
  }

  async atomicUpdateStock(
    id: string | mongoose.Types.ObjectId,
    quantity: number,
    session?: mongoose.ClientSession,
  ) {
    const updated = await Variant.findByIdAndUpdate(
      id,
      { $inc: { stock: quantity } },
      { returnDocument: "after", session },
    );

    if (updated && quantity < 0) {
      import("../../shared/event-bus/index.js")
        .then(({ eventBus }) => {
          eventBus.emit("inventory.stock.decremented", updated);
        })
        .catch(err => console.error("Error emitting inventory.stock.decremented:", err));
    }

    return updated;
  }

  async findProductIdsByName(search: string): Promise<mongoose.Types.ObjectId[]> {
    const products = await Product.find(
      { name: { $regex: search.trim(), $options: "i" } },
      "_id",
    ).lean();
    return products.map((p: any) => p._id);
  }

  async findTransactions(page: number, limit: number, type?: string, variantId?: string) {
    const query: any = {};
    if (variantId) {
      query.variantId = variantId;
    }
    if (type) {
      if (type === "customer_return") {
        query.code = { $regex: /^TXRET/ };
      } else if (type === "in") {
        query.type = "in";
        query.code = { $regex: /^(?!TXRET)/ };
      } else {
        query.type = type;
      }
    }

    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      InventoryTransaction.find(query)
        .populate({
          path: "variantId",
          populate: { path: "productId", select: "name imageUrl imageUrls" },
        })
        .populate("creatorId", "name")
        .sort({ _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      InventoryTransaction.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);

    return { transactions, total, limit, page, totalPages };
  }

  countTransactions(type?: string) {
    const query = type ? { type } : {};
    return InventoryTransaction.countDocuments(query);
  }

  createTransaction(
    data: {
      code: string;
      productId: any;
      variantId: any;
      type: "in" | "out" | "adjustment";
      qty: number;
      price?: number;
      creatorId: any;
      date: Date;
    },
    session?: mongoose.ClientSession,
  ) {
    return new InventoryTransaction(data).save({ session });
  }

  createGoodsReceipt(
    data: {
      code: string;
      supplierId: mongoose.Types.ObjectId;
      items: any[];
      totalAmount: number;
      creatorId: any;
    },
    session?: mongoose.ClientSession,
  ) {
    return GoodsReceipt.create([data], { session }).then((docs) => docs[0]);
  }

  createBatch(data: any, session?: mongoose.ClientSession) {
    return Batch.create([data], { session }).then((docs) => docs[0]);
  }

  findActiveBatchesByVariant(
    variantId: string | mongoose.Types.ObjectId,
    session?: mongoose.ClientSession,
  ) {
    return Batch.find({ variantId, remainingQty: { $gt: 0 } })
      .sort({ expiryDate: 1, createdAt: 1 })
      .session(session || null);
  }

  findActiveBatchesByVariants(variantIds: (string | mongoose.Types.ObjectId)[]) {
    return Batch.find({ variantId: { $in: variantIds }, remainingQty: { $gt: 0 } }).lean();
  }

  updateBatchQuantity(
    batchId: string | mongoose.Types.ObjectId,
    deductQty: number,
    session?: mongoose.ClientSession,
  ) {
    return Batch.findByIdAndUpdate(
      batchId,
      { $inc: { remainingQty: -deductQty } },
      { session },
    );
  }

  updateBatchInfo(
    batchId: string | mongoose.Types.ObjectId,
    data: { batchCode?: string; manufactureDate?: Date; expiryDate?: Date; importPrice?: number },
  ) {
    return Batch.findByIdAndUpdate(batchId, { $set: data }, { new: true });
  }

  async deductBatchesFIFO(
    variantId: string | mongoose.Types.ObjectId,
    deductQty: number,
    session?: mongoose.ClientSession,
  ): Promise<number> {
    const batches = await this.findActiveBatchesByVariant(variantId, session);
    let remainingToDeduct = deductQty;
    let totalCost = 0;

    for (const batch of batches) {
      if (remainingToDeduct <= 0) break;

      const updatedBatch = await Batch.findOneAndUpdate(
        { _id: batch._id, remainingQty: { $gt: 0 } },
        [
          {
            $set: {
              remainingQty: {
                $max: [0, { $subtract: ["$remainingQty", remainingToDeduct] }]
              }
            }
          }
        ],
        { session, new: false, updatePipeline: true }
      );

      if (updatedBatch) {
        const oldRemaining = updatedBatch.remainingQty;
        const deducted = Math.min(oldRemaining, remainingToDeduct);
        
        totalCost += deducted * (batch.importPrice || 0);
        remainingToDeduct -= deducted;
      }
    }

    return totalCost;
  }

  findLowStockVariants(limit = 10) {
    return Variant.find({ $expr: { $lte: ["$stock", "$minStock"] } }).limit(limit);
  }

  async aggregateTotalInventoryValue() {
    const result = await Batch.aggregate([
      { $match: { remainingQty: { $gt: 0 } } },
      { $group: { _id: null, totalValue: { $sum: { $multiply: ["$remainingQty", "$importPrice"] } } } }
    ]);
    return result[0]?.totalValue || 0;
  }

  countTotalSKUs() {
    return Variant.countDocuments({ isDeleted: { $ne: true } });
  }

  countOutOfStock() {
    return Variant.countDocuments({ stock: 0, isDeleted: { $ne: true } });
  }

  countLowStock() {
    return Variant.countDocuments({
      $expr: { $lte: ["$stock", "$minStock"] },
      stock: { $gt: 0 },
      isDeleted: { $ne: true }
    });
  }

  async findGoodsReceipts(page: number, limit: number, query: any = {}) {
    const skip = (page - 1) * limit;
    const [receipts, total] = await Promise.all([
      GoodsReceipt.find(query)
        .populate("supplierId", "name phone email contactPerson")
        .populate("creatorId", "name")
        .populate("items.productId", "name imageUrl imageUrls")
        .populate("items.variantId", "barcode sku imageUrl")
        .sort({ _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      GoodsReceipt.countDocuments(query),
    ]);
    const totalPages = Math.ceil(total / limit);
    return { receipts, total, limit, page, totalPages };
  }

  findGoodsReceiptById(id: string) {
    return GoodsReceipt.findById(id)
      .populate("supplierId", "name phone email address contactPerson")
      .populate("creatorId", "name")
      .populate("items.productId", "name imageUrl imageUrls")
      .populate("items.variantId", "barcode sku imageUrl")
      .lean();
  }

  createStocktake(data: any, session?: mongoose.ClientSession) {
    return Stocktake.create([data], { session }).then((docs) => docs[0]);
  }

  async findStocktakes(page: number, limit: number, query: any = {}) {
    const skip = (page - 1) * limit;
    const [stocktakes, total] = await Promise.all([
      Stocktake.find(query)
        .populate("creatorId", "name")
        .sort({ _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Stocktake.countDocuments(query),
    ]);
    const totalPages = Math.ceil(total / limit);
    return { stocktakes, total, limit, page, totalPages };
  }

  findStocktakeById(id: string) {
    return Stocktake.findById(id)
      .populate("creatorId", "name")
      .lean();
  }
}
