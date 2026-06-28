import Review from "../../models/user/review.schema.js";
import Product from "../../models/product/product.schema.js";
// ── Public ────────────────────────────────────────────────────────────────────
export const findByProductId = async (query, cursor, limit) => {
    if (cursor)
        query._id = { $lt: cursor };
    const reviews = await Review.find(query)
        .populate("userId", "name avatarUrl")
        .sort({ _id: -1 })
        .limit(limit + 1)
        .lean();
    const hasNextPage = reviews.length > limit;
    const items = hasNextPage ? reviews.slice(0, limit) : reviews;
    const nextCursor = hasNextPage ? items[items.length - 1]._id.toString() : null;
    return { reviews: items, nextCursor, hasNextPage, limit };
};
export const countByQuery = (query) => Review.countDocuments(query);
export const findOne = (query) => Review.findOne(query);
export const create = (data) => Review.create(data);
export const save = (review) => review.save();
/** Aggregate avg rating + total reviews cho một product */
export const aggregateStats = (productId) => Review.aggregate([
    { $match: { productId } },
    {
        $group: {
            _id: null,
            averageRating: { $avg: "$rating" },
            totalReviews: { $sum: 1 },
        },
    },
]);
// ── Admin ─────────────────────────────────────────────────────────────────────
export const findAllAdmin = async (query, cursor, limit) => {
    if (cursor)
        query._id = { $lt: cursor };
    const reviews = await Review.find(query)
        .populate("userId", "name avatarUrl")
        .populate("productId", "name slug imageUrl")
        .sort({ _id: -1 })
        .limit(limit + 1)
        .lean();
    const hasNextPage = reviews.length > limit;
    const items = hasNextPage ? reviews.slice(0, limit) : reviews;
    const nextCursor = hasNextPage ? items[items.length - 1]._id.toString() : null;
    return { reviews: items, nextCursor, hasNextPage, limit };
};
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
