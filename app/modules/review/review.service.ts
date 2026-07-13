import { injectable, inject } from "tsyringe";
import { ReviewRepository } from "./review.repository.js";
import { OrderRepository } from "../order/order.repository.js";
import mongoose from "mongoose";
import {
  badRequest,
  forbidden,
  notFound,
} from "../../shared/errors/httpErrors.js";
import type { CreateReviewInput } from "./dto/review.request.dto.js";
import { mapReview, mapAdminReview } from "./dto/review.response.dto.js";


import Product from "../product/models/product.schema.js";
import { UploadService } from "../upload/upload.service.js";

// ── Internal Helper ───────────────────────────────────────────────────────────

/**
 * Tính lại averageRating + numReviews cho product bằng toán học để tối ưu hiệu năng.
 * Gọi sau mỗi create/update/delete review.
 */
@injectable()
export class ReviewService {
  constructor(
    @inject(ReviewRepository) private readonly reviewRepo: ReviewRepository,
    @inject(OrderRepository) private readonly orderRepo: OrderRepository,
    @inject(UploadService) private readonly uploadService: UploadService
  ) {}

  updateProductStats = async (
  productId: mongoose.Types.ObjectId,
  action: "add" | "remove" | "update",
  newRating?: number,
  oldRating?: number
) => {
  const product = await Product.findById(productId).select("averageRating numReviews");
  if (!product) return;

  const old_average = product.averageRating || 0;
  const old_count = product.numReviews || 0;
  let new_average = old_average;
  let new_count = old_count;

  if (action === "add" && newRating !== undefined) {
    new_count = old_count + 1;
    new_average = ((old_average * old_count) + newRating) / new_count;
  } else if (action === "remove" && oldRating !== undefined) {
    new_count = Math.max(0, old_count - 1);
    new_average = new_count === 0 ? 0 : ((old_average * old_count) - oldRating) / new_count;
  } else if (action === "update" && newRating !== undefined && oldRating !== undefined) {
    if (old_count > 0) {
      new_average = ((old_average * old_count) - oldRating + newRating) / old_count;
    } else {
      new_count = 1;
      new_average = newRating;
    }
  }

  await Product.updateOne(
    { _id: productId },
    { $set: { averageRating: Number(new_average.toFixed(1)), numReviews: new_count } }
  );
};

// ── Public ────────────────────────────────────────────────────────────────────

  createReview = async (userId: string, data: CreateReviewInput) => {
  if (!mongoose.Types.ObjectId.isValid(data.productId)) {
    throw badRequest("Invalid product code");
  }

  const pId = new mongoose.Types.ObjectId(data.productId);
  const uId = new mongoose.Types.ObjectId(userId);

  // 1. Kiểm tra sản phẩm tồn tại
  const productExists = await Product.findById(pId).lean();
  if (!productExists) throw notFound("Product does not exist in the system");

  // 2. Anti-spam: mỗi user chỉ review 1 lần / product
  const existingReview = await this.reviewRepo.findOne({
    userId: uId,
    productId: pId,
  });
  if (existingReview) {
    throw badRequest(
      "You have already reviewed this product. Each person can only review once.",
    );
  }

  // 3. Verified Purchase enforcement:
  //    Chỉ cho phép review nếu user đã mua và nhận sản phẩm này (đơn COMPLETED).
  const orderItem = await this.orderRepo.getLatestCompletedOrderItem(uId, pId);

  if (!orderItem) {
    throw forbidden(
      "You can only review a product after purchasing and successfully receiving it.",
    );
  }

  const newReview = await this.reviewRepo.create({
    userId: uId,
    productId: pId,
    variantId: orderItem.variantId,
    variantName: orderItem.variantName,
    rating: data.rating,
    comment: data.comment,
    images: data.images,
    isVerifiedPurchase: true, // luôn true vì đã pass check trên
  });

  await this.updateProductStats(pId, "add", data.rating);
  return newReview;
};

  getReviewsByProductId = async (
  productId: string,
  page: number = 1,
  limit = 10,
  filterRating?: number,
  hasImage?: boolean,
  currentUserId?: string,
) => {
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw badRequest("Invalid product code");
  }

  const parsedLimit = Math.max(Number(limit) || 10, 1);

  const query: any = { productId: new mongoose.Types.ObjectId(productId) };
  if (filterRating) query.rating = filterRating;
  if (hasImage) query.images = { $exists: true, $not: { $size: 0 } };

  const [result, total] = await Promise.all([
    this.reviewRepo.findByProductId(query, page, parsedLimit),
    this.reviewRepo.countByQuery(query),
  ]);

  return {
    reviews: result.reviews.map((r: any) => mapReview(r, currentUserId)),
    pagination: {
      limit: parsedLimit,
      total,
      page: result.page,
      totalPages: result.totalPages,
    },
  };
};

  getProductReviewStats = async (productId: string) => {
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return { averageRating: 0, totalReviews: 0, ratingCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
  }

  const stats = await this.reviewRepo.aggregateStats(
    new mongoose.Types.ObjectId(productId),
  );
  if (stats.length > 0 && stats[0].overall.length > 0) {
    const overall = stats[0].overall[0];
    const breakdown = stats[0].breakdown;
    const ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    breakdown.forEach((item: any) => {
      if (item._id >= 1 && item._id <= 5) {
        (ratingCounts as any)[item._id] = item.count;
      }
    });
    return {
      averageRating: Number(overall.averageRating.toFixed(1)),
      totalReviews: overall.totalReviews,
      ratingCounts,
    };
  }

  return { averageRating: 0, totalReviews: 0, ratingCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
};

// ── Admin ─────────────────────────────────────────────────────────────────────

  getAllReviewsAdmin = async (
  page: number = 1,
  limit = 10,
  rating?: number,
  isReplied?: string,
  productName?: string,
) => {
  const parsedLimit = Math.max(Number(limit) || 10, 1);

  const query: any = {};
  if (rating) query.rating = rating;
  if (isReplied === "true") query.adminReply = { $ne: "" };
  else if (isReplied === "false")
    query.$or = [{ adminReply: "" }, { adminReply: { $exists: false } }];

  if (productName?.trim()) {
    const productIds = await this.reviewRepo.findProductIdsByName(productName);
    query.productId = { $in: productIds };
  }

  const [result, total] = await Promise.all([
    this.reviewRepo.findAllAdmin(query, page, parsedLimit),
    this.reviewRepo.countByQuery(query),
  ]);

  return {
    reviews: result.reviews.map((r: any) => mapAdminReview(r)),
    pagination: {
      limit: parsedLimit,
      total,
      page: result.page,
      totalPages: result.totalPages,
    },
  };
};

  deleteReviewAdmin = async (reviewId: string) => {
  if (!mongoose.Types.ObjectId.isValid(reviewId)) {
    throw badRequest("Invalid review code");
  }

  const result = await this.reviewRepo.findByIdAndDelete(reviewId);
  if (!result) throw badRequest("Review to delete was not found");

  // Clean up media files
  if (result.images && result.images.length > 0) {
    for (const url of result.images) {
      await this.uploadService.deleteFileByUrl(url);
    }
  }
  if (result.videos && result.videos.length > 0) {
    for (const url of result.videos) {
      await this.uploadService.deleteFileByUrl(url);
    }
  }

  await this.updateProductStats(result.productId as mongoose.Types.ObjectId, "remove", undefined, result.rating);
  return result;
};

  replyReviewAdmin = async (reviewId: string, replyText: string) => {
  if (!mongoose.Types.ObjectId.isValid(reviewId)) {
    throw badRequest("Invalid review code");
  }
  const text = replyText?.trim() || "";
  const updateData = text ? { adminReply: text } : { $unset: { adminReply: "" } };

  const result = await this.reviewRepo.findByIdAndUpdate(reviewId, updateData as any);
  if (!result) throw badRequest("Review not found");

  return result;
};

// ── User features ─────────────────────────────────────────────────────────────

  updateReviewByUser = async (
  userId: string,
  reviewId: string,
  rating: number,
  comment?: string,
  images?: string[],
) => {
  if (!mongoose.Types.ObjectId.isValid(reviewId)) {
    throw badRequest("Invalid review code");
  }

  const review = await this.reviewRepo.findOne({
    _id: reviewId,
    userId: new mongoose.Types.ObjectId(userId),
  });
  if (!review) {
    throw forbidden(
      "You do not have permission to edit this review or the review does not exist",
    );
  }

  const oldRating = review.rating;
  review.rating = rating;
  if (comment !== undefined) review.comment = comment;
  if (images !== undefined) review.images = images;
  await this.reviewRepo.save(review);

  await this.updateProductStats(review.productId as mongoose.Types.ObjectId, "update", rating, oldRating);
  return review;
};

  deleteReviewByUser = async (userId: string, reviewId: string) => {
  if (!mongoose.Types.ObjectId.isValid(reviewId)) {
    throw badRequest("Invalid review code");
  }

  const result = await this.reviewRepo.findOneAndDelete({
    _id: reviewId,
    userId: new mongoose.Types.ObjectId(userId),
  });
  if (!result) {
    throw forbidden(
      "You do not have permission to delete this review or the review does not exist",
    );
  }

  // Clean up media files
  if (result.images && result.images.length > 0) {
    for (const url of result.images) {
      await this.uploadService.deleteFileByUrl(url);
    }
  }
  if (result.videos && result.videos.length > 0) {
    for (const url of result.videos) {
      await this.uploadService.deleteFileByUrl(url);
    }
  }

  await this.updateProductStats(result.productId as mongoose.Types.ObjectId, "remove", undefined, result.rating);
  return { message: "Review deleted successfully" };
};

  checkReviewEligibility = async (
  userId: string,
  productId: string,
) => {
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw badRequest("Invalid product code");
  }

  const pId = new mongoose.Types.ObjectId(productId);
  const uId = new mongoose.Types.ObjectId(userId);

  // 1. Check if user already reviewed
  const existingReview = await this.reviewRepo.findOne({
    userId: uId,
    productId: pId,
  });
  if (existingReview) {
    return { canReview: false, reason: "already_reviewed" };
  }

  // 2. Check completed purchase
  const orderItem = await this.orderRepo.getLatestCompletedOrderItem(uId, pId);
  if (!orderItem) {
    return { canReview: false, reason: "not_purchased" };
  }

  return {
    canReview: true,
    variantName: orderItem.variantName,
  };
};

  likeReview = async (userId: string, reviewId: string) => {
  if (!mongoose.Types.ObjectId.isValid(reviewId)) {
    throw badRequest("Invalid review code");
  }

  const uId = new mongoose.Types.ObjectId(userId);
  const review = await this.reviewRepo.findOne({ _id: new mongoose.Types.ObjectId(reviewId) });
  if (!review) throw notFound("Review not found");

  if (!review.likes) review.likes = [];
  if (!review.dislikes) review.dislikes = [];

  const likedIndex = review.likes.findIndex((id) => id.toString() === userId);
  const dislikedIndex = review.dislikes.findIndex((id) => id.toString() === userId);

  if (likedIndex >= 0) {
    // Unlike
    review.likes.splice(likedIndex, 1);
  } else {
    // Like and remove dislike if exists
    review.likes.push(uId);
    if (dislikedIndex >= 0) {
      review.dislikes.splice(dislikedIndex, 1);
    }
  }

  await this.reviewRepo.save(review);
  return review;
};

  dislikeReview = async (userId: string, reviewId: string) => {
  if (!mongoose.Types.ObjectId.isValid(reviewId)) {
    throw badRequest("Invalid review code");
  }

  const uId = new mongoose.Types.ObjectId(userId);
  const review = await this.reviewRepo.findOne({ _id: new mongoose.Types.ObjectId(reviewId) });
  if (!review) throw notFound("Review not found");

  if (!review.likes) review.likes = [];
  if (!review.dislikes) review.dislikes = [];

  const likedIndex = review.likes.findIndex((id) => id.toString() === userId);
  const dislikedIndex = review.dislikes.findIndex((id) => id.toString() === userId);

  if (dislikedIndex >= 0) {
    // Remove dislike
    review.dislikes.splice(dislikedIndex, 1);
  } else {
    // Dislike and remove like if exists
    review.dislikes.push(uId);
    if (likedIndex >= 0) {
      review.likes.splice(likedIndex, 1);
    }
  }

  await this.reviewRepo.save(review);
  return review;
};

}
