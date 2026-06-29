import * as cartRepo from "./cart.repository.js";
import Variant from "../product/models/variant.schema.js";
import { notFound, badRequest } from "../../shared/errors/httpErrors.js";
import type { AddItemInput, SyncCartInput, UpdateItemInput } from "./dto/cart.request.dto.js";
import type { CartDocument } from "./models/cart.schema.js";
import { Types } from "mongoose";

export const getCart = async (userId: string) => {
  let cart = await cartRepo.findByUserId(userId);
  if (!cart) {
    cart = await cartRepo.create(userId);
  }
  return cart;
};

export const syncCart = async (userId: string, data: SyncCartInput) => {
  let cart = await cartRepo.findByUserId(userId);
  if (!cart) {
    cart = await cartRepo.create(userId);
  }

  for (const localItem of data.items) {
    // Check if variant exists and is active
    const variant = await Variant.findOne({ _id: localItem.variantId, isActive: true });
    if (!variant) continue; // Skip invalid variants

    const existingItem = cart.items.find(
      (item) => item.variantId?._id?.toString() === localItem.variantId || item.variantId?.toString() === localItem.variantId
    );

    if (existingItem) {
      existingItem.quantity = Math.min(existingItem.quantity + localItem.quantity, variant.stock);
    } else {
      cart.items.push({ 
        variantId: new Types.ObjectId(localItem.variantId), 
        quantity: Math.min(localItem.quantity, variant.stock) 
      });
    }
  }

  await cartRepo.save(cart);
  return cartRepo.findByUserId(userId); // Return fully populated cart
};

export const addItem = async (userId: string, data: AddItemInput) => {
  let cart = await cartRepo.findByUserId(userId);
  if (!cart) {
    cart = await cartRepo.create(userId);
  }

  const variant = await Variant.findOne({ _id: data.variantId, isActive: true });
  if (!variant) throw notFound("Sản phẩm không tồn tại hoặc đã ngừng kinh doanh");

  // Check stock
  if (variant.stock < data.quantity) {
    throw badRequest("Số lượng sản phẩm trong kho không đủ");
  }

  const existingItem = cart.items.find(
    (item) => item.variantId?._id?.toString() === data.variantId || item.variantId?.toString() === data.variantId
  );

  if (existingItem) {
    if (variant.stock < existingItem.quantity + data.quantity) {
      throw badRequest("Số lượng sản phẩm trong kho không đủ");
    }
    existingItem.quantity += data.quantity;
  } else {
    cart.items.push({ variantId: new Types.ObjectId(data.variantId), quantity: data.quantity });
  }

  await cartRepo.save(cart);
  return cartRepo.findByUserId(userId);
};

export const updateItem = async (userId: string, data: UpdateItemInput) => {
  const cart = await cartRepo.findByUserId(userId);
  if (!cart) throw notFound("Giỏ hàng trống");

  const existingItem = cart.items.find(
    (item) => item.variantId?._id?.toString() === data.variantId || item.variantId?.toString() === data.variantId
  );

  if (!existingItem) throw notFound("Sản phẩm không có trong giỏ hàng");

  const variant = await Variant.findOne({ _id: data.variantId, isActive: true });
  if (!variant) throw notFound("Sản phẩm không tồn tại hoặc đã ngừng kinh doanh");

  if (variant.stock < data.quantity) {
    throw badRequest("Số lượng sản phẩm trong kho không đủ");
  }

  existingItem.quantity = data.quantity;

  await cartRepo.save(cart);
  return cartRepo.findByUserId(userId);
};

export const removeItem = async (userId: string, variantId: string) => {
  const cart = await cartRepo.findByUserId(userId);
  if (!cart) throw notFound("Giỏ hàng trống");

  cart.items = cart.items.filter(
    (item) => item.variantId?._id?.toString() !== variantId && item.variantId?.toString() !== variantId
  );

  await cartRepo.save(cart);
  return cartRepo.findByUserId(userId);
};

export const clearCart = async (userId: string) => {
  await cartRepo.clearCart(userId);
};
