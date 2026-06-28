// ── Public Review Response ────────────────────────────────────────────────────
// ── Mappers ───────────────────────────────────────────────────────────────────
/**
 * mapReview — Dùng cho public endpoint (danh sách review theo productId).
 * Input là kết quả populate("userId", "name avatarUrl").
 */
export const mapReview = (r) => ({
    id: r._id.toString(),
    userId: r.userId?._id?.toString() ?? r.userId?.toString() ?? null,
    userName: r.userId?.name ?? "Người dùng Ẩn danh",
    userAvatar: r.userId?.avatarUrl ?? null,
    rating: r.rating,
    comment: r.comment,
    images: r.images ?? [],
    adminReply: r.adminReply ?? "",
    isVerifiedPurchase: r.isVerifiedPurchase,
    createdAt: r.createdAt,
});
/**
 * mapAdminReview — Dùng cho admin endpoint (bổ sung product info).
 * Input là kết quả populate("userId", ...) + populate("productId", "name slug").
 */
export const mapAdminReview = (r) => ({
    ...mapReview(r),
    productId: r.productId?._id?.toString() ?? null,
    productName: r.productId?.name ?? "Sản phẩm không xác định",
    productSlug: r.productId?.slug ?? "",
    productImage: r.productId?.imageUrl ?? null,
});
