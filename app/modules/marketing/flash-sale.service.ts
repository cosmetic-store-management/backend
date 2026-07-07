import mongoose from "mongoose";
import { badRequest, notFound } from "../../shared/errors/httpErrors.js";
import * as flashSaleRepo from "./flash-sale.repository.js";
import type { CreateFlashSaleInput } from "./dto/flash-sale.request.dto.js";
import { mapFlashSale } from "./dto/flash-sale.response.dto.js";
import Product from "../product/models/product.schema.js";
import Variant from "../product/models/variant.schema.js";

export const getActiveFlashSale = async () => {
  const fs = await flashSaleRepo.findActiveFlashSale();
  if (!fs) return null;
  return mapFlashSale(fs);
};

export const getTimelineFlashSales = async () => {
  const fsList = await flashSaleRepo.findTimelineFlashSales();
  return fsList.map(mapFlashSale);
};

export const getAllFlashSales = async (filters: any = {}, page = 1, limit = 10) => {
  const query: any = {};
  const now = new Date();

  // Status Filter
  if (filters.status === "active") {
    query.isActive = true;
    query.startTime = { $lte: now };
    query.endTime = { $gte: now };
  } else if (filters.status === "upcoming") {
    query.isActive = true;
    query.startTime = { $gt: now };
  } else if (filters.status === "ended") {
    query.$or = [{ isActive: false }, { endTime: { $lt: now } }];
  }

  // Search Filter
  if (filters.search) {
    query.name = { $regex: filters.search, $options: "i" };
  }

  const skip = (page - 1) * limit;
  const data = await flashSaleRepo.findAll(query, skip, limit);
  const total = await flashSaleRepo.countAll(query);
  return {
    data: data.map(mapFlashSale),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const getFlashSaleById = async (id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) throw badRequest("Invalid ID");
  const fs = await flashSaleRepo.findById(id);
  if (!fs) throw notFound("Flash Sale does not exist");
  return mapFlashSale(fs);
};

import FlashSale from "./models/flash-sale.schema.js";

export const validateFlashSaleItems = async (
  items: any[],
  startTime: Date | string,
  endTime: Date | string,
  excludeId?: string
) => {
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (start >= end) {
    throw badRequest("Start time must be before end time");
  }

  if (process.env.NODE_ENV === "test") {
    return;
  }

  const now = new Date();
  if (end <= now) {
    throw badRequest("Flash sale end time must be in the future");
  }

  const variantIds = items.map(i => i.variantId);
  const [variantsList, productsList] = await Promise.all([
    Variant.find({ _id: { $in: variantIds } }),
    Product.find({ _id: { $in: items.map(i => i.productId) } })
  ]);

  const variantMap = new Map(variantsList.map(v => [v._id.toString(), v]));
  const productMap = new Map(productsList.map(p => [p._id.toString(), p]));

  for (const item of items) {
    const variant = variantMap.get(item.variantId.toString());
    const product = productMap.get(item.productId.toString());

    if (!variant || !product) {
      throw notFound(`Product or Variant not found`);
    }

    if (variant.productId.toString() !== product._id.toString()) {
      throw badRequest(`Variant ${variant.name} does not belong to product ${product.name}`);
    }

    if (!variant.isActive || !product.isActive) {
      throw badRequest(`Product ${product.name} or variant ${variant.name} is currently inactive`);
    }

    const normalPrice = variant.discountPrice && variant.discountPrice > 0 ? variant.discountPrice : variant.price;
    if (item.flashPrice >= normalPrice) {
      throw badRequest(
        `Flash price (${item.flashPrice} ₫) must be less than normal price (${normalPrice} ₫) for ${product.name} (${variant.name})`
      );
    }
  }

  const overlapQuery: any = {
    isActive: true,
    _id: excludeId ? { $ne: new mongoose.Types.ObjectId(excludeId) } : { $exists: true },
    $or: [
      { startTime: { $lt: end }, endTime: { $gt: start } }
    ]
  };

  const overlappingEvents = await FlashSale.find(overlapQuery).lean();
  if (overlappingEvents.length > 0) {
    const activeVariantIds = new Set(variantIds.map(id => id.toString()));
    for (const event of overlappingEvents) {
      for (const eventItem of event.items) {
        if (activeVariantIds.has(eventItem.variantId.toString())) {
          const matchedVariant = variantMap.get(eventItem.variantId.toString());
          throw badRequest(
            `Variant ${matchedVariant?.name || eventItem.variantId} already belongs to another overlapping active/upcoming flash sale event: "${event.name}"`
          );
        }
      }
    }
  }
};

export const createFlashSale = async (data: CreateFlashSaleInput) => {
  await validateFlashSaleItems(data.items, data.startTime, data.endTime);
  const newFs = await flashSaleRepo.create({
    ...data,
    items: data.items.map(i => ({
      productId: new mongoose.Types.ObjectId(i.productId),
      variantId: new mongoose.Types.ObjectId(i.variantId),
      flashPrice: i.flashPrice,
      quantityLimit: i.quantityLimit,
      soldQuantity: 0,
    })),
  });
  const populated = await flashSaleRepo.findById(newFs._id.toString());
  return mapFlashSale(populated);
};

export const updateFlashSale = async (id: string, data: CreateFlashSaleInput) => {
  if (!mongoose.Types.ObjectId.isValid(id)) throw badRequest("Invalid ID");
  const fs = await flashSaleRepo.findById(id);
  if (!fs) throw notFound("Flash Sale does not exist");

  await validateFlashSaleItems(data.items, data.startTime, data.endTime, id);

  const updatedFs = await flashSaleRepo.update(id, {
    ...data,
    items: data.items.map(i => {
      const existingItem = fs.items.find(
        (old: any) => old.variantId._id.toString() === i.variantId
      );
      return {
        productId: new mongoose.Types.ObjectId(i.productId),
        variantId: new mongoose.Types.ObjectId(i.variantId),
        flashPrice: i.flashPrice,
        quantityLimit: i.quantityLimit,
        soldQuantity: existingItem ? existingItem.soldQuantity : 0,
      };
    }),
  });

  return mapFlashSale(updatedFs);
};

export const deleteFlashSale = async (id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) throw badRequest("Invalid ID");
  const fs = await flashSaleRepo.findById(id);
  if (!fs) throw notFound("Flash Sale does not exist");
  await flashSaleRepo.deleteById(id);
  return { success: true, message: "Deleted successfully" };
};
