
// ── Public Review Response ────────────────────────────────────────────────────

export interface ReviewResponse {
  id: string;
  userId: string | null;
  userName: string;
  userAvatar: string | null;
  rating: number;
  comment: string;
  images: string[];
  videos?: string[];
  variantName?: string;
  likesCount: number;
  dislikesCount: number;
  hasLiked?: boolean;
  hasDisliked?: boolean;
  adminReply: string;
  isVerifiedPurchase: boolean;
  createdAt: Date;
}

// ── Admin Review Response (bổ sung product info) ─────────────────────────────

export interface AdminReviewResponse extends ReviewResponse {
  productId: string | null;
  productName: string;
  productSlug: string;
  productImage: string | null;
}

// ── Mappers ───────────────────────────────────────────────────────────────────

/**
 * mapReview — Dùng cho public endpoint (danh sách review theo productId).
 * Input là kết quả populate("userId", "name avatarUrl").
 */
export const mapReview = (r: any, currentUserId?: string): ReviewResponse => {
  const likes = r.likes ?? [];
  const dislikes = r.dislikes ?? [];

  return {
    id: r._id.toString(),
    userId: r.userId?._id?.toString() ?? r.userId?.toString() ?? null,
    userName: r.userId?.name ?? "Người dùng Ẩn danh",
    userAvatar: r.userId?.avatarUrl ?? null,
    rating: r.rating,
    comment: r.comment,
    images: r.images ?? [],
    videos: r.videos ?? [],
    variantName: r.variantName,
    likesCount: likes.length,
    dislikesCount: dislikes.length,
    hasLiked: currentUserId ? likes.some((id: any) => id.toString() === currentUserId) : false,
    hasDisliked: currentUserId ? dislikes.some((id: any) => id.toString() === currentUserId) : false,
    adminReply: r.adminReply ?? "",
    isVerifiedPurchase: r.isVerifiedPurchase,
    createdAt: r.createdAt,
  };
};

/**
 * mapAdminReview — Dùng cho admin endpoint (bổ sung product info).
 * Input là kết quả populate("userId", ...) + populate("productId", "name slug").
 */
export const mapAdminReview = (r: any, currentUserId?: string): AdminReviewResponse => ({
  ...mapReview(r, currentUserId),
  productId: r.productId?._id?.toString() ?? null,
  productName: r.productId?.name ?? "Sản phẩm không xác định",
  productSlug: r.productId?.slug ?? "",
  productImage: r.productId?.imageUrl ?? null,
});

