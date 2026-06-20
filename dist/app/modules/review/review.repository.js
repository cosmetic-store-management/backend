import Review from "../../models/review.schema.js";
import Product from "../../models/product.schema.js";
// ── Public ────────────────────────────────────────────────────────────────────
export const findByProductId = (query, skip, limit) => Review.find(query)
    .populate("userId", "name avatarUrl")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
export const countByQuery = (query) => Review.countDocuments(query);
export const findOne = (query) => Review.findOne(query);
export const create = (data) => Review.create(data);
export const save = (review) => review.save();
/** Aggregate avg rating + total reviews cho một product */
export const aggregateStats = (productId) => Review.aggregate([
    { $match: { productId } },
    { $group: { _id: null, averageRating: { $avg: "$rating" }, totalReviews: { $sum: 1 } } }
]);
// ── Admin ─────────────────────────────────────────────────────────────────────
export const findAllAdmin = (query, skip, limit) => Review.find(query)
    .populate("userId", "name avatarUrl")
    .populate("productId", "name slug")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
export const findByIdAndDelete = (id) => Review.findByIdAndDelete(id);
export const findByIdAndUpdate = (id, data) => Review.findByIdAndUpdate(id, data, { returnDocument: "after" });
export const findOneAndDelete = (query) => Review.findOneAndDelete(query);
// ── Product Stats Sync ────────────────────────────────────────────────────────
/** Tìm sản phẩm theo tên (để lọc reviews theo product) */
export const findProductIdsByName = async (name) => {
    const products = await Product.find({ name: { $regex: name.trim(), $options: "i" } }, "_id").lean();
    return products.map((p) => p._id);
};
export const updateProductStats = (productId, averageRating, numReviews) => Product.findByIdAndUpdate(productId, { averageRating, numReviews });
