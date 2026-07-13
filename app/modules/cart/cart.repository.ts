import { injectable } from "tsyringe";
import Cart, { CartDocument } from "./models/cart.schema.js";

@injectable()
export class CartRepository {
  async findByUserId(userId: string): Promise<CartDocument | null> {
    return Cart.findOne({ userId }).populate({
      path: "items.variantId",
      select: "productId name sku price discountPrice imageUrl stock minStock isActive",
      populate: {
        path: "productId",
        select: "name slug imageUrl categoryId",
      },
    });
  }

  async create(userId: string): Promise<CartDocument> {
    return Cart.create({ userId, items: [] });
  }

  async save(cart: CartDocument): Promise<CartDocument> {
    return cart.save();
  }

  async clearCart(userId: string): Promise<void> {
    await Cart.updateOne({ userId }, { $set: { items: [] } });
  }
}
