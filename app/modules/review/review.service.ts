import mongoose from "mongoose";
import {
  badRequest,
  forbidden,
  notFound,
} from "../../shared/errors/httpErrors.js";
import type { CreateReviewInput } from "./dto/review.request.dto.js";
import { mapReview, mapAdminReview } from "./dto/review.response.dto.js";
import * as orderRepo from "../order/order.repository.js";
import * as reviewRepo from "./review.repository.js";
import Product from "../../models/product/product.schema.js";

// ── Internal Helper ───────────────────────────────────────────────────────────

/**
 * Tính lại averageRating + numReviews cho product từ DB.
 * Gọi sau mỗi create/update/delete review.
 */
export const updateProductStats = async (
  productId: mongoose.Types.ObjectId,
) => {
  const stats = await reviewRepo.aggregateStats(productId);

  if (stats.length > 0) {
    await reviewRepo.updateProductStats(
      productId,
      Number(stats[0].averageRating.toFixed(1)),
      stats[0].totalReviews,
    );
  } else {
    await reviewRepo.updateProductStats(productId, 0, 0);
  }
};

// ── Public ────────────────────────────────────────────────────────────────────

export const createReview = async (userId: string, data: CreateReviewInput) => {
  if (!mongoose.Types.ObjectId.isValid(data.productId)) {
    throw badRequest("Mã sản phẩm không hợp lệ");
  }

  const pId = new mongoose.Types.ObjectId(data.productId);
  const uId = new mongoose.Types.ObjectId(userId);

  // 1. Kiểm tra sản phẩm tồn tại
  const productExists = await Product.findById(pId).lean();
  if (!productExists) throw notFound("Sản phẩm không tồn tại trong hệ thống");

  // 2. Anti-spam: mỗi user chỉ review 1 lần / product
  const existingReview = await reviewRepo.findOne({
    userId: uId,
    productId: pId,
  });
  if (existingReview) {
    throw badRequest(
      "Bạn đã đánh giá sản phẩm này rồi. Mỗi người chỉ được đánh giá 1 lần.",
    );
  }

  // 3. Verified Purchase enforcement:
  //    Chỉ cho phép review nếu user đã mua và nhận sản phẩm này (đơn COMPLETED).
  //    isVerifiedPurchase = true  → user đã mua, được review.
  //    isVerifiedPurchase = false → chưa mua → từ chối.
  const userOrders = await orderRepo.findOrdersByUserId(userId);
  const completedOrders = userOrders.filter(
    (o) => o.orderStatus === "completed",
  );

  const isVerifiedPurchase = completedOrders.some((order) =>
    ((order as any).items || []).some(
      (item: any) => item.productId.toString() === data.productId,
    ),
  );

  if (!isVerifiedPurchase) {
    throw forbidden(
      "Bạn chỉ có thể đánh giá sản phẩm sau khi đã mua và nhận hàng thành công.",
    );
  }

  const newReview = await reviewRepo.create({
    userId: uId,
    productId: pId,
    rating: data.rating,
    comment: data.comment,
    images: data.images,
    isVerifiedPurchase: true, // luôn true vì đã pass check trên
  });

  await updateProductStats(pId);
  return newReview;
};

export const getReviewsByProductId = async (
  productId: string,
  cursor: string | null = null,
  limit = 10,
  filterRating?: number,
  hasImage?: boolean,
) => {
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw badRequest("Mã sản phẩm không hợp lệ");
  }

  const parsedLimit = Math.max(Number(limit) || 10, 1);

  const query: any = { productId: new mongoose.Types.ObjectId(productId) };
  if (filterRating) query.rating = filterRating;
  if (hasImage) query.images = { $exists: true, $not: { $size: 0 } };

  const [result, total] = await Promise.all([
    reviewRepo.findByProductId(query, cursor, parsedLimit),
    reviewRepo.countByQuery(query),
  ]);

  return {
    reviews: result.reviews.map(mapReview),
    pagination: {
      limit: parsedLimit,
      total,
      nextCursor: result.nextCursor,
      hasNextPage: result.hasNextPage,
    },
  };
};

export const getProductReviewStats = async (productId: string) => {
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return { averageRating: 0, totalReviews: 0 };
  }

  const stats = await reviewRepo.aggregateStats(
    new mongoose.Types.ObjectId(productId),
  );
  if (stats.length > 0) {
    return {
      averageRating: Number(stats[0].averageRating.toFixed(1)),
      totalReviews: stats[0].totalReviews,
    };
  }

  return { averageRating: 0, totalReviews: 0 };
};

// ── Admin ─────────────────────────────────────────────────────────────────────

export const getAllReviewsAdmin = async (
  cursor: string | null = null,
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
    const productIds = await reviewRepo.findProductIdsByName(productName);
    query.productId = { $in: productIds };
  }

  const [result, total] = await Promise.all([
    reviewRepo.findAllAdmin(query, cursor, parsedLimit),
    reviewRepo.countByQuery(query),
  ]);

  return {
    reviews: result.reviews.map(mapAdminReview),
    pagination: {
      limit: parsedLimit,
      total,
      nextCursor: result.nextCursor,
      hasNextPage: result.hasNextPage,
    },
  };
};

export const deleteReviewAdmin = async (reviewId: string) => {
  if (!mongoose.Types.ObjectId.isValid(reviewId)) {
    throw badRequest("Mã đánh giá không hợp lệ");
  }

  const result = await reviewRepo.findByIdAndDelete(reviewId);
  if (!result) throw badRequest("Không tìm thấy đánh giá cần xóa");

  await updateProductStats(result.productId as mongoose.Types.ObjectId);
  return result;
};

export const replyReviewAdmin = async (reviewId: string, replyText: string) => {
  if (!mongoose.Types.ObjectId.isValid(reviewId)) {
    throw badRequest("Mã đánh giá không hợp lệ");
  }
  const text = replyText?.trim() || "";
  const updateData = text ? { adminReply: text } : { $unset: { adminReply: "" } };

  const result = await reviewRepo.findByIdAndUpdate(reviewId, updateData as any);
  if (!result) throw badRequest("Không tìm thấy đánh giá");

  return result;
};

// ── User features ─────────────────────────────────────────────────────────────

export const updateReviewByUser = async (
  userId: string,
  reviewId: string,
  rating: number,
  comment?: string,
  images?: string[],
) => {
  if (!mongoose.Types.ObjectId.isValid(reviewId)) {
    throw badRequest("Mã đánh giá không hợp lệ");
  }

  const review = await reviewRepo.findOne({
    _id: reviewId,
    userId: new mongoose.Types.ObjectId(userId),
  });
  if (!review) {
    throw forbidden(
      "Bạn không có quyền sửa đánh giá này hoặc đánh giá không tồn tại",
    );
  }

  review.rating = rating;
  if (comment !== undefined) review.comment = comment;
  if (images !== undefined) review.images = images;
  await reviewRepo.save(review);

  await updateProductStats(review.productId as mongoose.Types.ObjectId);
  return review;
};

export const deleteReviewByUser = async (userId: string, reviewId: string) => {
  if (!mongoose.Types.ObjectId.isValid(reviewId)) {
    throw badRequest("Mã đánh giá không hợp lệ");
  }

  const result = await reviewRepo.findOneAndDelete({
    _id: reviewId,
    userId: new mongoose.Types.ObjectId(userId),
  });
  if (!result) {
    throw forbidden(
      "Bạn không có quyền xóa đánh giá này hoặc đánh giá không tồn tại",
    );
  }

  await updateProductStats(result.productId as mongoose.Types.ObjectId);
  return { message: "Đã xóa đánh giá thành công" };
};
