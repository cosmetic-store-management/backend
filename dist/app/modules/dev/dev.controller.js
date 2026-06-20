import { Router } from "express";
import Product from "../../models/product.schema.js";
import Variant from "../../models/variant.schema.js";
import Category from "../../models/category.schema.js";
const router = Router();
router.post("/seed-detailed", async (req, res) => {
    try {
        let category = await Category.findOne({ slug: "moi" });
        if (!category) {
            category = await Category.findOne();
        }
        const descHtml = `
      <div style="text-align: center; max-width: 800px; margin: 0 auto; font-family: sans-serif;">
        <h2 style="color: #ff6b6b; margin-bottom: 20px;">[NEW BARE] Son Tint Lì Romand Juicy Lasting Tint 5.5g</h2>
        <p style="font-size: 16px; color: #333; line-height: 1.6;">Son Tint Lì Romand Juicy Lasting Tint là dòng son tint thuộc thương hiệu Romand với chất son trong trẻo, tạo hiệu ứng căng mọng tự nhiên cho đôi môi, màu son duy trì trong nhiều giờ liền cho bạn cảm giác bờ môi sáng bóng, căng mọng và ngọt ngào.</p>
        <img src="https://thegioiskinfood.com/theme.hstatic.net/1000006063/1001370907/14/logo.png" style="width: 100%; border-radius: 8px; margin: 20px 0;" alt="Infographic 1" />
        <h3 style="text-align: left; color: #ff6b6b; border-bottom: 2px solid #ff6b6b; padding-bottom: 5px; margin-top: 30px;">🌟 Đặc trưng nổi bật</h3>
        <ul style="text-align: left; line-height: 1.8; color: #444; font-size: 15px;">
          <li>Thiết kế dạng thân trụ tròn có màu sắc trùng với màu son bên trong.</li>
          <li>Chất son gel tint mềm mịn, không gây bết dính.</li>
          <li>Độ bám màu cao, giữ màu lâu mà không gây cảm giác nặng môi.</li>
        </ul>
      </div>
    `;
        const product = new Product({
            name: "Son Tint Lì Romand Juicy Lasting Tint 5.5g (Mẫu Mới)",
            slug: "son-tint-li-romand-juicy-lasting-tint-mau-moi",
            brand: "Romand",
            description: descHtml,
            imageUrl: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&q=80",
            imageUrls: [
                "https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&q=80",
                "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&q=80",
                "https://images.unsplash.com/photo-1571781926291-c477eb31f762?auto=format&fit=crop&q=80"
            ],
            categoryId: category._id,
            isActive: true,
            averageRating: 4.9,
            numReviews: 342,
        });
        const savedProduct = await product.save();
        await Variant.create([
            { name: "22 Pomelo Skin", sku: "ROMAND-22", price: 159000, stock: 50, imageUrl: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&q=80", productId: savedProduct._id },
            { name: "23 Nucadamia", sku: "ROMAND-23", price: 159000, discountPrice: 149000, stock: 0, imageUrl: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&q=80", productId: savedProduct._id },
            { name: "24 Peeling Angdoo", sku: "ROMAND-24", price: 159000, stock: 120, imageUrl: "https://images.unsplash.com/photo-1571781926291-c477eb31f762?auto=format&fit=crop&q=80", productId: savedProduct._id }
        ]);
        const product2 = new Product({
            name: "Gel Tẩy Tế Bào Chết Hóa Học Axis-Y PHA Resurfacing Glow Peel 50ml",
            slug: "gel-tay-te-bao-chet-axis-y-pha",
            brand: "Axis-Y",
            description: "<p>Sản phẩm chỉ có 1 phân loại duy nhất. UI Khách hàng sẽ giấu phần chọn Phân loại đi.</p>",
            imageUrl: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&q=80",
            imageUrls: ["https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&q=80"],
            categoryId: category._id,
            isActive: true,
            averageRating: 4.5,
            numReviews: 120,
        });
        const savedProduct2 = await product2.save();
        await Variant.create({
            productId: savedProduct2._id,
            name: "Default Title",
            sku: "AXISY-01",
            price: 250000,
            stock: 100,
            imageUrl: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&q=80"
        });
        res.json({ message: "Seeded successfully" });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
export default router;
