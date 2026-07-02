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

export const createFlashSale = async (data: CreateFlashSaleInput) => {
  // Bỏ comment nếu muốn validate từng variant/product
  // await validateFlashSaleItems(data.items);
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

  const updatedFs = await flashSaleRepo.update(id, {
    ...data,
    items: data.items.map(i => {
      // Giữ nguyên soldQuantity nếu item cũ đã tồn tại
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
