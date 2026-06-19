/**
 * review.integration.test.ts — Integration tests cho Review Service + Repository
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { connectTestDB, disconnectTestDB, clearCollections } from "./helpers/db-helper.js";
import mongoose from "mongoose";

import * as reviewService from "../../app/modules/review/review.service.js";
import Review from "../../app/models/review.schema.js";
import User from "../../app/models/user.schema.js";
import Product from "../../app/models/product.schema.js";
import Order from "../../app/models/order.schema.js";
import Category from "../../app/models/category.schema.js";

let userId:    string;
let productId: string;

beforeAll(async () => {
  await connectTestDB();
});
afterAll(async () => { await disconnectTestDB(); });

beforeEach(async () => {
  await clearCollections();

  // Seed: tạo Category → Product → User → Order (completed) để test có đủ dữ liệu
  const category = await Category.create({
    name: "Skincare", slug: "skincare", isActive: true,
  });

  const product = await Product.create({
    name:       "Kem dưỡng ẩm",
    slug:       "kem-duong-am",
    categoryId: category._id,
    brandId:    new mongoose.Types.ObjectId(),
    isActive:   true,
    imageUrl:   "https://example.com/img.jpg",
  });
  productId = product._id.toString();

  const user = await User.create({
    name:  "Reviewer",
    phone: "0909090909",
    role:  "customer",
  });
  userId = user._id.toString();

  // Tạo completed order để user được phép review
  await Order.create({
    code:         "ORD-TEST",
    userId:       user._id,
    orderStatus:  "completed",
    paymentMethod: "cod",
    subtotal:     100_000,
    totalAmount:  100_000,
    shippingFee:  0,
    tierDiscountAmount: 0,
    items: [{ productId: product._id, variantId: new mongoose.Types.ObjectId(), quantity: 1, productName: "Kem", variantName: "50ml", imageUrl: "", price: 100_000, lineTotal: 100_000 }],
    receiverName: "Reviewer",
    phone:        "0909090909",
    province:     "HCM",
    district:     "Q1",
    ward:         "P1",
    street:       "123 Lê Lợi",
  });
});

// ── createReview ──────────────────────────────────────────────────────────────

describe("[Integration] Review — createReview", () => {
  it("tạo review thành công và cập nhật averageRating của product", async () => {
    await reviewService.createReview(userId, {
      productId, rating: 4, comment: "Tốt lắm", images: [],
    });

    const review = await Review.findOne({ productId, userId });
    expect(review).not.toBeNull();
    expect(review?.rating).toBe(4);

    // averageRating phải được cập nhật
    const updatedProduct = await Product.findById(productId);
    expect(updatedProduct?.averageRating).toBe(4);
    expect(updatedProduct?.numReviews).toBe(1);
  });

  it("không cho review lần 2 cùng sản phẩm (anti-spam)", async () => {
    await reviewService.createReview(userId, { productId, rating: 5, comment: "Review 1", images: [] });
    await expect(
      reviewService.createReview(userId, { productId, rating: 3, comment: "Review 2", images: [] })
    ).rejects.toMatchObject({ status: 400 });
  });

  it("cập nhật đúng averageRating khi có nhiều reviews", async () => {
    // User 2
    const user2 = await User.create({ name: "User2", phone: "0911111111", role: "customer" });
    await Order.create({
      code: "ORD-2", userId: user2._id, orderStatus: "completed",
      paymentMethod: "cod",
      subtotal: 100_000, totalAmount: 100_000, shippingFee: 0, tierDiscountAmount: 0,
      items: [{ productId: new mongoose.Types.ObjectId(productId), variantId: new mongoose.Types.ObjectId(), quantity: 1, productName: "Kem", variantName: "50ml", imageUrl: "", price: 100_000, lineTotal: 100_000 }],
      receiverName: "U2", phone: "0911111111", province: "HN", district: "HK", ward: "P1", street: "456 Kim Mã",
    });

    await reviewService.createReview(userId, { productId, rating: 5, comment: "A", images: [] });
    await reviewService.createReview(user2._id.toString(), { productId, rating: 3, comment: "B", images: [] });

    const updatedProduct = await Product.findById(productId);
    expect(updatedProduct?.averageRating).toBe(4); // (5+3)/2 = 4
    expect(updatedProduct?.numReviews).toBe(2);
  });
});

// ── deleteReviewByUser ────────────────────────────────────────────────────────

describe("[Integration] Review — deleteReviewByUser", () => {
  it("xóa review và cập nhật lại stats của product", async () => {
    const review = await reviewService.createReview(userId, {
      productId, rating: 4, comment: "OK", images: [],
    });

    const reviewId = (await Review.findOne({ userId, productId }))!._id.toString();
    await reviewService.deleteReviewByUser(userId, reviewId);

    const deleted = await Review.findById(reviewId);
    expect(deleted).toBeNull();

    // numReviews phải về 0
    const updatedProduct = await Product.findById(productId);
    expect(updatedProduct?.numReviews).toBe(0);
  });
});
