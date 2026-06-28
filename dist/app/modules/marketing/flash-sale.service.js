import mongoose from "mongoose";
import { badRequest, notFound } from "../../shared/errors/httpErrors.js";
import * as flashSaleRepo from "./flash-sale.repository.js";
import { mapFlashSale } from "./dto/flash-sale.response.dto.js";
export const getActiveFlashSale = async () => {
    const fs = await flashSaleRepo.findActiveFlashSale();
    if (!fs)
        return null;
    return mapFlashSale(fs);
};
export const getTimelineFlashSales = async () => {
    const fsList = await flashSaleRepo.findTimelineFlashSales();
    return fsList.map(mapFlashSale);
};
export const getAllFlashSales = async (page = 1, limit = 10) => {
    const skip = (page - 1) * limit;
    const data = await flashSaleRepo.findAll(skip, limit);
    const total = await flashSaleRepo.countAll();
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
export const getFlashSaleById = async (id) => {
    if (!mongoose.Types.ObjectId.isValid(id))
        throw badRequest("ID không hợp lệ");
    const fs = await flashSaleRepo.findById(id);
    if (!fs)
        throw notFound("Flash Sale không tồn tại");
    return mapFlashSale(fs);
};
export const createFlashSale = async (data) => {
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
export const updateFlashSale = async (id, data) => {
    if (!mongoose.Types.ObjectId.isValid(id))
        throw badRequest("ID không hợp lệ");
    const fs = await flashSaleRepo.findById(id);
    if (!fs)
        throw notFound("Flash Sale không tồn tại");
    const updatedFs = await flashSaleRepo.update(id, {
        ...data,
        items: data.items.map(i => {
            // Giữ nguyên soldQuantity nếu item cũ đã tồn tại
            const existingItem = fs.items.find((old) => old.variantId._id.toString() === i.variantId);
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
export const deleteFlashSale = async (id) => {
    if (!mongoose.Types.ObjectId.isValid(id))
        throw badRequest("ID không hợp lệ");
    const fs = await flashSaleRepo.findById(id);
    if (!fs)
        throw notFound("Flash Sale không tồn tại");
    await flashSaleRepo.deleteById(id);
    return { message: "Xóa thành công" };
};
