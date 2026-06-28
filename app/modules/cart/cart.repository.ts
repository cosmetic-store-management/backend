import Cart, { CartDocument } from "../../models/cart/cart.schema.js";

export const findByUserId = async (
  userId: string,
): Promise<CartDocument | null> => {
  return Cart.findOne({ userId }).populate({
    path: "items.variantId",
    select: "productId name sku price discountPrice imageUrl stock minStock",
    populate: {
      path: "productId",
      select: "name slug imageUrl categoryId",
    },
  });
};

export const create = async (userId: string): Promise<CartDocument> => {
  return Cart.create({ userId, items: [] });
};

export const save = async (cart: CartDocument): Promise<CartDocument> => {
  return cart.save();
};

export const clearCart = async (userId: string): Promise<void> => {
  await Cart.updateOne({ userId }, { $set: { items: [] } });
};
