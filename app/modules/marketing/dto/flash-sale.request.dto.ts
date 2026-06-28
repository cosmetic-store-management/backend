import { z } from "zod";

export const createFlashSaleSchema = z.object({
  name: z.string().min(1, "Tên chương trình không được để trống"),
  startTime: z.string().datetime({ message: "Thời gian bắt đầu không hợp lệ" }),
  endTime: z.string().datetime({ message: "Thời gian kết thúc không hợp lệ" }),
  isActive: z.boolean().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1, "ID sản phẩm không được để trống"),
        variantId: z.string().min(1, "ID biến thể không được để trống"),
        flashPrice: z.number().min(0, "Giá flash sale phải lớn hơn hoặc bằng 0"),
        quantityLimit: z.number().min(1, "Số lượng giới hạn phải lớn hơn 0"),
      })
    )
    .min(1, "Phải có ít nhất 1 sản phẩm trong Flash Sale"),
});

export type CreateFlashSaleInput = z.infer<typeof createFlashSaleSchema>;
