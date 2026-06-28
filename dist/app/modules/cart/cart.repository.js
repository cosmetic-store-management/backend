import Cart from "../../models/cart/cart.schema.js";
export const findByUserId = async (userId) => {
    return Cart.findOne({ userId }).populate({
        path: "items.variantId",
        select: "productId name sku price discountPrice imageUrl stock minStock",
        populate: {
            path: "productId",
            select: "name slug imageUrl categoryId",
        },
    });
};
export const create = async (userId) => {
    return Cart.create({ userId, items: [] });
};
export const save = async (cart) => {
    return cart.save();
};
export const clearCart = async (userId) => {
    await Cart.updateOne({ userId }, { $set: { items: [] } });
};
