import FlashSale from "./models/flash-sale.schema.js";
import mongoose from "mongoose";

export const findActiveFlashSale = async () => {
  const now = new Date();
  return FlashSale.findOne({
    isActive: true,
    startTime: { $lte: now },
    endTime: { $gt: now },
  })
    .populate({
      path: "items.productId",
      select: "name imageUrl slug brandId",
      populate: { path: "brandId", select: "name" }
    })
    .populate("items.variantId", "name price")
    .lean();
};

export const findTimelineFlashSales = async () => {
  const now = new Date();
  return FlashSale.find({
    isActive: true,
    endTime: { $gt: now }, // Chỉ lấy các sự kiện chưa kết thúc
  })
    .sort({ startTime: 1 }) // Sắp xếp theo thời gian bắt đầu
    .limit(5) // Lấy tối đa 5 sự kiện (1 hiện tại + 4 sắp tới)
    .populate({
      path: "items.productId",
      select: "name imageUrl slug brandId",
      populate: { path: "brandId", select: "name" }
    })
    .populate("items.variantId", "name price")
    .lean();
};

export const findAll = async (skip: number, limit: number) => {
  return FlashSale.find()
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate({
      path: "items.productId",
      select: "name imageUrl slug brandId",
      populate: { path: "brandId", select: "name" }
    })
    .populate("items.variantId", "name price")
    .lean();
};

export const countAll = async () => {
  return FlashSale.countDocuments();
};

export const findById = async (id: string) => {
  return FlashSale.findById(id)
    .populate({
      path: "items.productId",
      select: "name imageUrl slug brandId",
      populate: { path: "brandId", select: "name" }
    })
    .populate("items.variantId", "name price")
    .lean();
};

export const create = async (data: any) => {
  return FlashSale.create(data);
};

export const update = async (id: string, data: any) => {
  return FlashSale.findByIdAndUpdate(id, data, { new: true })
    .populate({
      path: "items.productId",
      select: "name imageUrl slug brandId",
      populate: { path: "brandId", select: "name" }
    })
    .populate("items.variantId", "name price")
    .lean();
};

export const deleteById = async (id: string) => {
  return FlashSale.findByIdAndDelete(id);
};

export const incrementFlashSaleSoldQuantity = async (
  flashSaleId: string,
  variantId: string,
  quantity: number,
  session?: mongoose.ClientSession
) => {
  return FlashSale.updateOne(
    { _id: flashSaleId, "items.variantId": variantId },
    { $inc: { "items.$.soldQuantity": quantity } },
    { session }
  );
};

