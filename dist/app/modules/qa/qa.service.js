import mongoose from "mongoose";
import { badRequest, notFound } from "../../shared/errors/httpErrors.js";
import { mapQA, mapAdminQA } from "./dto/qa.response.dto.js";
import * as qaRepo from "./qa.repository.js";
import Product from "../../models/product/product.schema.js";
export const createQA = async (userId, data) => {
    if (!mongoose.Types.ObjectId.isValid(data.productId)) {
        throw badRequest("Mã sản phẩm không hợp lệ");
    }
    const pId = new mongoose.Types.ObjectId(data.productId);
    const productExists = await Product.findById(pId).lean();
    if (!productExists)
        throw notFound("Sản phẩm không tồn tại");
    const newQA = await qaRepo.create({
        productId: pId,
        userId: userId ? new mongoose.Types.ObjectId(userId) : undefined,
        userName: data.userName || "Khách",
        question: data.question,
        status: "pending",
    });
    return mapQA(newQA);
};
export const getQAsByProductId = async (productId, page = 1, limit = 10) => {
    if (!mongoose.Types.ObjectId.isValid(productId)) {
        throw badRequest("Mã sản phẩm không hợp lệ");
    }
    const skip = (page - 1) * limit;
    const qas = await qaRepo.findByProductId(productId, skip, limit);
    const total = await qaRepo.countByProductId(productId);
    return {
        qas: qas.map(mapQA),
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
};
export const getAllQAsAdmin = async (page = 1, limit = 10, status, productName) => {
    const skip = (page - 1) * limit;
    const { data, total } = await qaRepo.findAllForAdmin(skip, limit, status, productName);
    return {
        qas: data.map(mapAdminQA),
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
};
export const replyQAAdmin = async (qaId, adminId, data) => {
    if (!mongoose.Types.ObjectId.isValid(qaId)) {
        throw badRequest("Mã câu hỏi không hợp lệ");
    }
    const qa = await qaRepo.findById(qaId);
    if (!qa)
        throw notFound("Câu hỏi không tồn tại");
    const updatedQA = await qaRepo.update(qaId, {
        answer: data.answer,
        adminId: new mongoose.Types.ObjectId(adminId),
        status: "answered",
    });
    return mapAdminQA(updatedQA);
};
export const deleteQAAdmin = async (qaId) => {
    if (!mongoose.Types.ObjectId.isValid(qaId)) {
        throw badRequest("Mã câu hỏi không hợp lệ");
    }
    const qa = await qaRepo.findById(qaId);
    if (!qa)
        throw notFound("Câu hỏi không tồn tại");
    await qaRepo.deleteById(qaId);
    return true;
};
