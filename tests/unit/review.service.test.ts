/**
 * review.service.test.ts — Unit tests cho Review Service
 * Kiểm tra: anti-spam, verified purchase enforcement, update/delete ownership.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../app/modules/review/review.repository.js");
vi.mock("../../app/modules/order/order.repository.js");
vi.mock("../../app/modules/review/dto/review.response.dto.js", () => ({
  mapReview: (r: any) => r,
  mapAdminReview: (r: any) => r,
}));
vi.mock("../../app/modules/product/models/product.schema.js", () => ({
  default: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn().mockResolvedValue(null),
  },
}));

import * as reviewRepo from "../../app/modules/review/review.repository.js";
import * as orderRepo from "../../app/modules/order/order.repository.js";
import * as reviewService from "../../app/modules/review/review.service.js";
import Product from "../../app/modules/product/models/product.schema.js";
import mongoose from "mongoose";

const FAKE_USER_ID = new mongoose.Types.ObjectId().toString();
const FAKE_PRODUCT_ID = new mongoose.Types.ObjectId().toString();
const FAKE_REVIEW_ID = new mongoose.Types.ObjectId().toString();

const makeFakeReview = (overrides: Record<string, any> = {}) => ({
  _id: { toString: () => FAKE_REVIEW_ID },
  userId: { toString: () => FAKE_USER_ID },
  productId: { toString: () => FAKE_PRODUCT_ID },
  rating: 5,
  comment: "Tốt lắm",
  images: [],
  save: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

beforeEach(() => vi.clearAllMocks());

// ── createReview ──────────────────────────────────────────────────────────────

describe("reviewService.createReview", () => {
  const input = {
    productId: FAKE_PRODUCT_ID,
    rating: 5,
    comment: "Sản phẩm tốt",
    images: [],
    videos: [],
  };

  it("tạo review thành công khi user đã mua và chưa review", async () => {
    vi.mocked(Product.findById as any).mockReturnValue({
      lean: () => Promise.resolve({ _id: FAKE_PRODUCT_ID }),
    });
    vi.mocked(reviewRepo.findOne).mockResolvedValue(null);
    vi.mocked(orderRepo.findOrdersByUserId).mockResolvedValue([
      {
        orderStatus: "completed",
        items: [{ productId: { toString: () => FAKE_PRODUCT_ID } }],
      } as any,
    ]);
    vi.mocked(reviewRepo.create).mockResolvedValue(makeFakeReview() as any);
    vi.mocked(reviewRepo.aggregateStats).mockResolvedValue([
      { averageRating: 5, totalReviews: 1 },
    ] as any);
    await reviewService.createReview(FAKE_USER_ID, input);

    expect(reviewRepo.create).toHaveBeenCalledOnce();
  });

  it("throw forbidden khi user chưa mua sản phẩm", async () => {
    vi.mocked(Product.findById as any).mockReturnValue({
      lean: () => Promise.resolve({ _id: FAKE_PRODUCT_ID }),
    });
    vi.mocked(reviewRepo.findOne).mockResolvedValue(null);
    vi.mocked(orderRepo.findOrdersByUserId).mockResolvedValue([]); // không có order

    await expect(
      reviewService.createReview(FAKE_USER_ID, input),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("throw badRequest khi user đã review sản phẩm này rồi (anti-spam)", async () => {
    vi.mocked(Product.findById as any).mockReturnValue({
      lean: () => Promise.resolve({ _id: FAKE_PRODUCT_ID }),
    });
    vi.mocked(reviewRepo.findOne).mockResolvedValue(makeFakeReview() as any); // đã có review

    await expect(
      reviewService.createReview(FAKE_USER_ID, input),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throw badRequest khi productId không hợp lệ", async () => {
    await expect(
      reviewService.createReview(FAKE_USER_ID, {
        ...input,
        productId: "invalid_id",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

// ── deleteReviewByUser ────────────────────────────────────────────────────────

describe("reviewService.deleteReviewByUser", () => {
  it("xóa thành công khi review thuộc về user", async () => {
    vi.mocked(reviewRepo.findOneAndDelete).mockResolvedValue(
      makeFakeReview() as any,
    );
    vi.mocked(reviewRepo.aggregateStats).mockResolvedValue([] as any);
    vi.mocked(reviewRepo.updateProductStats).mockResolvedValue(null as any);

    const result = await reviewService.deleteReviewByUser(
      FAKE_USER_ID,
      FAKE_REVIEW_ID,
    );
    expect(result).toMatchObject({ message: expect.stringContaining("xóa") });
  });

  it("throw forbidden khi review không thuộc về user", async () => {
    vi.mocked(reviewRepo.findOneAndDelete).mockResolvedValue(null);

    await expect(
      reviewService.deleteReviewByUser(FAKE_USER_ID, FAKE_REVIEW_ID),
    ).rejects.toMatchObject({ status: 403 });
  });
});

// ── updateReviewByUser ────────────────────────────────────────────────────────

describe("reviewService.updateReviewByUser", () => {
  it("cập nhật rating thành công", async () => {
    const fakeReview = makeFakeReview({ rating: 3 });
    vi.mocked(reviewRepo.findOne).mockResolvedValue(fakeReview as any);
    vi.mocked(reviewRepo.save).mockResolvedValue(undefined as any);
    vi.mocked(reviewRepo.aggregateStats).mockResolvedValue([
      { averageRating: 4, totalReviews: 1 },
    ] as any);
    vi.mocked(reviewRepo.updateProductStats).mockResolvedValue(null as any);

    await reviewService.updateReviewByUser(
      FAKE_USER_ID,
      FAKE_REVIEW_ID,
      5,
      "Tốt hơn",
    );
    expect(fakeReview.rating).toBe(5);
    expect(reviewRepo.save).toHaveBeenCalledWith(fakeReview);
  });

  it("throw forbidden khi review không thuộc về user", async () => {
    vi.mocked(reviewRepo.findOne).mockResolvedValue(null);

    await expect(
      reviewService.updateReviewByUser(FAKE_USER_ID, FAKE_REVIEW_ID, 5),
    ).rejects.toMatchObject({ status: 403 });
  });
});
