


import { catchAsync } from "../../shared/helpers/catchAsync.js";

import { badRequest } from "../../shared/errors/httpErrors.js";

import * as response from "../../shared/helpers/response.js";


import * as reviewService from "./review.service.js";

import { logAction } from "../audit-log/audit-log.service.js";

export const getAdminList = catchAsync(async (req, res) => {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 10;
    const rating = req.query.rating
      ? parseInt(req.query.rating as string, 10)
      : undefined;
    const isReplied = req.query.isReplied as string | undefined;
    const productName = req.query.productName as string | undefined;

    const result = await reviewService.getAllReviewsAdmin(
      page,
      limit,
      rating,
      isReplied,
      productName,
    );
    return response.success(res, result);
  });

export const deleteAdminId = catchAsync(async (req, res) => {
    const reviewId = req.params.id as string;
    await reviewService.deleteReviewAdmin(reviewId);
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "delete",
      "catalog",
      `Xóa đánh giá (ID: ${reviewId})`,
      req.ip || "127.0.0.1",
    );
    return response.success(res, { message: "Review deleted successfully" });
  });

export const patchAdminIdReply = catchAsync(async (req, res) => {
    const reviewId = req.params.id as string;
    const { replyText } = req.body;
    const result = await reviewService.replyReviewAdmin(reviewId, replyText);
    await logAction(
      req.user!._id.toString(),
      req.user!.name,
      "update",
      "catalog",
      `Phản hồi đánh giá (ID: ${reviewId})`,
      req.ip || "127.0.0.1",
    );
    return response.success(res, {
      message: "Đã phản hồi đánh giá",
      review: result,
    });
  });

export const patchId = catchAsync(async (req, res) => {
    const { rating, comment, images } = req.body;
    if (!rating) {
      throw badRequest("Vui lòng cung cấp điểm đánh giá");
    }
    const result = await reviewService.updateReviewByUser(
      req.user!._id.toString(),
      req.params.id as string,
      rating,
      comment,
      images,
    );
    return response.success(res, {
      message: "Cập nhật đánh giá thành công",
      review: result,
    });
  });

export const deleteId = catchAsync(async (req, res) => {
    const { id } = req.params;
    await reviewService.deleteReviewByUser(
      req.user!._id.toString(),
      id as string,
    );
    return response.success(res, { message: "Xóa đánh giá thành công" });
  });

export const getProductProductId = catchAsync(async (req, res) => {
    const productId = req.params.productId as string;
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 10;
    const rating = req.query.rating
      ? parseInt(req.query.rating as string, 10)
      : undefined;
    const hasImage = req.query.hasImage === "true";

    const result = await reviewService.getReviewsByProductId(
      productId,
      page,
      limit,
      rating,
      hasImage,
      req.user?._id?.toString(),
    );

    // Try to get stats as well
    const stats = await reviewService.getProductReviewStats(productId);

    return response.success(res, { ...result, stats });
  });

export const postRoot = catchAsync(async (req, res) => {
    const review = await reviewService.createReview(
      req.user!._id.toString(),
      req.body,
    );
    return response.created(res, {
      message: "Đánh giá sản phẩm thành công",
      review,
    });
  });

export const getEligibilityProductId = catchAsync(async (req, res) => {
    const result = await reviewService.checkReviewEligibility(
      req.user!._id.toString(),
      req.params.productId as string,
    );
    return response.success(res, result);
  });

export const postIdLike = catchAsync(async (req, res) => {
    const result = await reviewService.likeReview(
      req.user!._id.toString(),
      req.params.id as string,
    );
    return response.success(res, {
      message: "Lượt thích đã được cập nhật",
      likesCount: result.likes?.length || 0,
      dislikesCount: result.dislikes?.length || 0,
    });
  });

export const postIdDislike = catchAsync(async (req, res) => {
    const result = await reviewService.dislikeReview(
      req.user!._id.toString(),
      req.params.id as string,
    );
    return response.success(res, {
      message: "Lượt không thích đã được cập nhật",
      likesCount: result.likes?.length || 0,
      dislikesCount: result.dislikes?.length || 0,
    });
  });