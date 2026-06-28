import { z } from "zod";
export const CreateQASchema = z.object({
    productId: z.string().min(1, "Mã sản phẩm là bắt buộc"),
    question: z.string().min(1, "Nội dung câu hỏi không được để trống").max(1000, "Câu hỏi tối đa 1000 ký tự"),
    userName: z.string().min(1, "Tên người hỏi là bắt buộc").optional(), // optional vì nếu đăng nhập sẽ lấy từ user
});
export const ReplyQASchema = z.object({
    answer: z.string().min(1, "Nội dung trả lời không được để trống").max(2000, "Câu trả lời tối đa 2000 ký tự"),
});
