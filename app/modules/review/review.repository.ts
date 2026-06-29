/**
 * review.repository.ts
 * Data access layer cho Review module.
 */
import mongoose from "mongoose";
import Review from "./models/review.schema.js";
import Product from "../product/models/product.schema.js";

// ── Public ────────────────────────────────────────────────────────────────────

export const findByProductId = async (
  query: Record<string, any>,
  cursor: string | null,
  limit: number,
) => {
  if (cursor) query._id = { $lt: cursor };
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

export const countByQuery = (query: Record<string, any>) =>
  Review.countDocuments(query);

export const findOne = (query: Record<string, any>) => Review.findOne(query);

export const create = (data: {
  userId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  rating: number;
  comment?: string;
  images?: string[];
  isVerifiedPurchase: boolean;
}) => Review.create(data);

export const save = (review: any) => review.save();

/** Aggregate avg rating + total reviews cho một product */
export const aggregateStats = (productId: mongoose.Types.ObjectId) =>
  Review.aggregate([
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

export const findAllAdmin = async (
  query: Record<string, any>,
  cursor: string | null,
  limit: number,
) => {
  if (cursor) query._id = { $lt: cursor };
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

export const findByIdAndDelete = (id: string) => Review.findByIdAndDelete(id);

export const findByIdAndUpdate = (id: string, data: Record<string, any>) =>
  Review.findByIdAndUpdate(id, data, { returnDocument: "after" });

export const findOneAndDelete = (query: Record<string, any>) =>
  Review.findOneAndDelete(query);

// ── Product Stats Sync ────────────────────────────────────────────────────────

/** Tìm sản phẩm theo tên (để lọc reviews theo product) */
export const findProductIdsByName = async (
  name: string,
): Promise<mongoose.Types.ObjectId[]> => {
  const products = await Product.find(
    { name: { $regex: name.trim(), $options: "i" } },
    "_id",
  ).lean();
  return products.map((p: any) => p._id);
};

export const updateProductStats = (
  productId: mongoose.Types.ObjectId,
  averageRating: number,
  numReviews: number,
) => Product.findByIdAndUpdate(productId, { averageRating, numReviews });
