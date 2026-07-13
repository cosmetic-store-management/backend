import { injectable } from "tsyringe";
import mongoose from "mongoose";
import Review from "./models/review.schema.js";
import Product from "../product/models/product.schema.js";

@injectable()
export class ReviewRepository {
  async findByProductId(query: Record<string, any>, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [reviews, total] = await Promise.all([
      Review.find(query)
        .populate("userId", "name avatarUrl")
        .sort({ _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Review.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);

    return { reviews, total, limit, page, totalPages };
  }

  countByQuery(query: Record<string, any>) {
    return Review.countDocuments(query);
  }

  findOne(query: Record<string, any>) {
    return Review.findOne(query);
  }

  create(data: {
    userId: mongoose.Types.ObjectId;
    productId: mongoose.Types.ObjectId;
    variantId?: mongoose.Types.ObjectId;
    variantName?: string;
    rating: number;
    comment?: string;
    images?: string[];
    isVerifiedPurchase: boolean;
  }) {
    return Review.create(data);
  }

  save(review: any) {
    return review.save();
  }

  aggregateStats(productId: mongoose.Types.ObjectId) {
    return Review.aggregate([
      { $match: { productId } },
      {
        $facet: {
          overall: [
            {
              $group: {
                _id: null,
                averageRating: { $avg: "$rating" },
                totalReviews: { $sum: 1 },
              },
            },
          ],
          breakdown: [
            {
              $group: {
                _id: "$rating",
                count: { $sum: 1 },
              },
            },
          ],
        },
      },
    ]);
  }

  async findAllAdmin(query: Record<string, any>, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [reviews, total] = await Promise.all([
      Review.find(query)
        .populate("userId", "name avatarUrl")
        .populate("productId", "name slug imageUrl")
        .sort({ _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Review.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);

    return { reviews, total, limit, page, totalPages };
  }

  findByIdAndDelete(id: string) {
    return Review.findByIdAndDelete(id);
  }

  findByIdAndUpdate(id: string, data: Record<string, any>) {
    return Review.findByIdAndUpdate(id, data, { returnDocument: "after" });
  }

  findOneAndDelete(query: Record<string, any>) {
    return Review.findOneAndDelete(query);
  }

  async findProductIdsByName(name: string): Promise<mongoose.Types.ObjectId[]> {
    const products = await Product.find(
      { name: { $regex: name.trim(), $options: "i" } },
      "_id",
    ).lean();
    return products.map((p: any) => p._id);
  }

  updateProductStats(
    productId: mongoose.Types.ObjectId,
    averageRating: number,
    numReviews: number,
  ) {
    return Product.findByIdAndUpdate(productId, { averageRating, numReviews });
  }
}
