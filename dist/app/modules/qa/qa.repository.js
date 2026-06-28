import mongoose from "mongoose";
import QA from "../../models/qa/qa.schema.js";
export const create = async (data) => {
    return await QA.create(data);
};
export const findById = async (id) => {
    return await QA.findById(id).lean();
};
export const update = async (id, data) => {
    return await QA.findByIdAndUpdate(id, data, { new: true }).lean();
};
export const deleteById = async (id) => {
    return await QA.findByIdAndDelete(id).lean();
};
export const findByProductId = async (productId, skip, limit) => {
    return await QA.find({ productId: new mongoose.Types.ObjectId(productId) })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
};
export const countByProductId = async (productId) => {
    return await QA.countDocuments({ productId: new mongoose.Types.ObjectId(productId) });
};
export const findAllForAdmin = async (skip, limit, status, productName) => {
    const query = {};
    if (status)
        query.status = status;
    if (productName) {
        const pipeline = [
            {
                $lookup: {
                    from: "products",
                    localField: "productId",
                    foreignField: "_id",
                    as: "productId",
                },
            },
            { $unwind: "$productId" },
            {
                $match: {
                    "productId.name": { $regex: productName, $options: "i" },
                    ...(status ? { status } : {}),
                },
            },
            { $sort: { createdAt: -1 } },
            {
                $facet: {
                    metadata: [{ $count: "total" }],
                    data: [{ $skip: skip }, { $limit: limit }],
                },
            },
        ];
        const result = await QA.aggregate(pipeline);
        const data = result[0]?.data || [];
        const total = result[0]?.metadata?.[0]?.total || 0;
        return { data, total };
    }
    const [data, total] = await Promise.all([
        QA.find(query)
            .populate("productId", "name images")
            .populate("adminId", "name")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        QA.countDocuments(query),
    ]);
    return { data, total };
};
