import { injectable } from "tsyringe";
import FlashSale from "./models/flash-sale.schema.js";
import mongoose from "mongoose";

@injectable()
export class FlashSaleRepository {
  findActiveFlashSale() {
    const now = new Date();
    return FlashSale.findOne({
      isActive: true,
      startTime: { $lte: now },
      endTime: { $gt: now },
    })
      .populate({
        path: "items.productId",
        select: "name imageUrl slug brandId",
        populate: { path: "brandId", select: "name" },
      })
      .populate("items.variantId", "name price")
      .lean();
  }

  findRaw(query: any) {
    return FlashSale.find(query);
  }

  findTimelineFlashSales() {
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
        populate: { path: "brandId", select: "name" },
      })
      .populate("items.variantId", "name price")
      .lean();
  }

  findAll(query: any = {}, skip: number = 0, limit: number = 10) {
    return FlashSale.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: "items.productId",
        select: "name imageUrl slug brandId",
        populate: { path: "brandId", select: "name" },
      })
      .populate("items.variantId", "name price")
      .lean();
  }

  countAll(query: any = {}) {
    return FlashSale.countDocuments(query);
  }

  findById(id: string) {
    return FlashSale.findById(id)
      .populate({
        path: "items.productId",
        select: "name imageUrl slug brandId",
        populate: { path: "brandId", select: "name" },
      })
      .populate("items.variantId", "name price")
      .lean();
  }

  create(data: any) {
    return FlashSale.create(data);
  }

  update(id: string, data: any) {
    return FlashSale.findByIdAndUpdate(id, data, { new: true })
      .populate({
        path: "items.productId",
        select: "name imageUrl slug brandId",
        populate: { path: "brandId", select: "name" },
      })
      .populate("items.variantId", "name price")
      .lean();
  }

  deleteById(id: string) {
    return FlashSale.findByIdAndDelete(id);
  }

  async incrementFlashSaleSoldQuantity(
    flashSaleId: string,
    variantId: string,
    quantity: number,
    session?: mongoose.ClientSession
  ) {
    const flashSale = await FlashSale.findOne({ _id: flashSaleId }).session(
      session || null
    );
    if (!flashSale) {
      throw new Error("Flash Sale not found");
    }
    const item = flashSale.items.find(
      (i: any) => i.variantId.toString() === variantId.toString()
    );
    if (!item) {
      throw new Error("Product is not in a Flash Sale");
    }
    if (item.soldQuantity + quantity > item.quantityLimit) {
      throw new Error(
        `Sản phẩm đã vượt quá số lượng giới hạn mua Flash Sale (còn lại: ${
          item.quantityLimit - item.soldQuantity
        })`
      );
    }

    const result = await FlashSale.updateOne(
      {
        _id: flashSaleId,
        items: {
          $elemMatch: {
            variantId: variantId,
            soldQuantity: { $lte: item.quantityLimit - quantity },
          },
        },
      },
      { $inc: { "items.$.soldQuantity": quantity } },
      { session }
    );

    if (result.modifiedCount === 0) {
      throw new Error(
        `Sản phẩm đã vượt quá số lượng giới hạn mua Flash Sale (còn lại: ${
          item.quantityLimit - item.soldQuantity
        })`
      );
    }

    return result;
  }
}
