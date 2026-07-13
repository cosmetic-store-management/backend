import { injectable, inject } from "tsyringe";
import mongoose from "mongoose";
import User from "../user/models/user.schema.js";
import Product from "./models/product.schema.js";
import { ProductRepository } from "./product.repository.js";
import { mapProduct } from "./dto/product.response.dto.js";

@injectable()
export class RecommendationService {
  constructor(
    @inject(ProductRepository) private readonly productRepo: ProductRepository
  ) {}

  getRecommendations = async (userId: string | null, limit = 10) => {
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      const user = await User.findById(userId).lean();
      if (user) {
        // 1. Get categories from recentlyViewed
        const recentProductIds = user.recentlyViewed || [];
        
        // 2. We can also get categories from completed orders
        // But for simplicity, let's just use recentlyViewed first
        
        if (recentProductIds.length > 0) {
          const recentProducts = await Product.find({
            _id: { $in: recentProductIds },
            isActive: true
          }).lean();
          
          const categoryIds = recentProducts.map(p => p.categoryId);
          const uniqueCategoryIds = [...new Set(categoryIds.map(id => id?.toString()))].filter(Boolean);

          if (uniqueCategoryIds.length > 0) {
            const recommendedProducts = await this.productRepo.findPublic(
              {
                categoryId: { $in: uniqueCategoryIds },
                _id: { $nin: recentProductIds }, // don't recommend what they just viewed
                isActive: true,
              },
              0,
              limit,
              { sold: -1, averageRating: -1 }
            );

            if (recommendedProducts.length > 0) {
              return recommendedProducts.map((p) => mapProduct(p));
            }
          }
        }
      }
    }

    // Fallback to top selling products
    const topSelling = await this.productRepo.findPublic(
      { isActive: true },
      0,
      limit,
      { sold: -1 }
    );
      
    return topSelling.map((p) => mapProduct(p));
  };
}
