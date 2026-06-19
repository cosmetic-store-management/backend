import { z } from "zod";

export const CreateReviewSchema = z.object({
  productId: z.string().min(1, "Vui lòng chọn sản phẩm"),
  rating: z.number().int().min(1, "Điểm đánh giá thấp nhất là 1").max(5, "Điểm đánh giá cao nhất là 5"),
  comment: z.string().trim().optional().default(""),
  images: z.array(z.string().url("Đường dẫn ảnh không hợp lệ")).optional().default([]),
});

export type CreateReviewInput = z.infer<typeof CreateReviewSchema>;
