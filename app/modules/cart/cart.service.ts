import { injectable, inject } from "tsyringe";
import { CartRepository } from "./cart.repository.js";
import Variant from "../product/models/variant.schema.js";
import { notFound, badRequest } from "../../shared/errors/httpErrors.js";
import type { AddItemInput, SyncCartInput, UpdateItemInput } from "./dto/cart.request.dto.js";
import { Types } from "mongoose";

@injectable()
export class CartService {
  constructor(
    @inject(CartRepository) private readonly cartRepo: CartRepository
  ) {}

  async getCart(userId: string) {
    let cart = await this.cartRepo.findByUserId(userId);
    if (!cart) {
      cart = await this.cartRepo.create(userId);
    }
    return cart;
  }

  async syncCart(userId: string, data: SyncCartInput) {
    let cart = await this.cartRepo.findByUserId(userId);
    if (!cart) {
      cart = await this.cartRepo.create(userId);
    }

    for (const localItem of data.items) {
      const variant = await Variant.findOne({ _id: localItem.variantId, isActive: true });
      if (!variant) continue;

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

    await this.cartRepo.save(cart);
    return this.cartRepo.findByUserId(userId);
  }

  async addItem(userId: string, data: AddItemInput) {
    let cart = await this.cartRepo.findByUserId(userId);
    if (!cart) {
      cart = await this.cartRepo.create(userId);
    }

    const variant = await Variant.findOne({ _id: data.variantId, isActive: true });
    if (!variant) throw notFound("Product does not exist or has been discontinued");

    if (variant.stock < data.quantity) {
      throw badRequest("Insufficient product stock");
    }

    const existingItem = cart.items.find(
      (item) => item.variantId?._id?.toString() === data.variantId || item.variantId?.toString() === data.variantId
    );

    if (existingItem) {
      if (variant.stock < existingItem.quantity + data.quantity) {
        throw badRequest("Insufficient product stock");
      }
      existingItem.quantity += data.quantity;
    } else {
      cart.items.push({ variantId: new Types.ObjectId(data.variantId), quantity: data.quantity });
    }

    await this.cartRepo.save(cart);
    return this.cartRepo.findByUserId(userId);
  }

  async updateItem(userId: string, data: UpdateItemInput) {
    const cart = await this.cartRepo.findByUserId(userId);
    if (!cart) throw notFound("Cart is empty");

    const existingItem = cart.items.find(
      (item) => item.variantId?._id?.toString() === data.variantId || item.variantId?.toString() === data.variantId
    );

    if (!existingItem) throw notFound("Sản phẩm không có trong giỏ hàng");

    const variant = await Variant.findOne({ _id: data.variantId, isActive: true });
    if (!variant) throw notFound("Product does not exist or has been discontinued");

    if (variant.stock < data.quantity) {
      throw badRequest("Insufficient product stock");
    }

    existingItem.quantity = data.quantity;

    await this.cartRepo.save(cart);
    return this.cartRepo.findByUserId(userId);
  }

  async removeItem(userId: string, variantId: string) {
    const cart = await this.cartRepo.findByUserId(userId);
    if (!cart) throw notFound("Cart is empty");

    cart.items = cart.items.filter(
      (item) => item.variantId?._id?.toString() !== variantId && item.variantId?.toString() !== variantId
    );

    await this.cartRepo.save(cart);
    return this.cartRepo.findByUserId(userId);
  }

  async clearCart(userId: string) {
    await this.cartRepo.clearCart(userId);
  }
}
