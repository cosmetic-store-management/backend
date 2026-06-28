import { describe, it, expect, vi, beforeEach } from "vitest";
import * as cartService from "../../app/modules/cart/cart.service.js";
import * as cartRepository from "../../app/modules/cart/cart.repository.js";
import Product from "../../app/models/product/product.schema.js";
import Variant from "../../app/models/product/variant.schema.js";

// Mock repositories and models
vi.mock("../../app/modules/cart/cart.repository.js");
vi.mock("../../app/models/product/product.schema.js");
vi.mock("../../app/models/product/variant.schema.js");

describe("Cart Service Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCart", () => {
    it("should return empty cart if not found", async () => {
      vi.mocked(cartRepository.findByUserId).mockResolvedValue(null);
      vi.mocked(cartRepository.create).mockResolvedValue({ userId: "user1", items: [] } as any);
      const cart = await cartService.getCart("user1");
      expect(cart).toEqual({ userId: "user1", items: [] });
      expect(cartRepository.create).toHaveBeenCalledWith("user1");
    });

    it("should return existing cart", async () => {
      const mockCart = { userId: "user1", items: [{ variantId: "v1", quantity: 2 }] };
      vi.mocked(cartRepository.findByUserId).mockResolvedValue(mockCart as any);
      const cart = await cartService.getCart("user1");
      expect(cart).toEqual(mockCart);
    });
  });

  describe("syncCart", () => {
    it("should merge local items into server cart", async () => {
      const mockServerCart = {
        userId: "user1",
        items: [{ variantId: { _id: "507f1f77bcf86cd799439011" }, quantity: 1 }],
      };
      
      const localData = {
        items: [{ variantId: "507f1f77bcf86cd799439022", quantity: 2 }, { variantId: "507f1f77bcf86cd799439011", quantity: 1 }]
      };

      // first call returns old cart, second call returns updated cart
      vi.mocked(cartRepository.findByUserId)
        .mockResolvedValueOnce(mockServerCart as any)
        .mockResolvedValueOnce({
          userId: "user1",
          items: [
            { variantId: { _id: "507f1f77bcf86cd799439011" }, quantity: 2 },
            { variantId: { _id: "507f1f77bcf86cd799439022" }, quantity: 2 }
          ]
        } as any);
      
      // Mock checking variant and product (using findOne)
      vi.mocked(Variant.findOne).mockResolvedValue({ _id: "507f1f77bcf86cd799439011", stock: 10, isActive: true, productId: "p1" } as any);

      vi.mocked(cartRepository.save).mockResolvedValue({
        userId: "user1",
        items: [
          { variantId: "v1", quantity: 2 }, // 1 + 1
          { variantId: "v2", quantity: 2 }
        ]
      } as any);

      const result = await cartService.syncCart("user1", localData);
      expect(cartRepository.save).toHaveBeenCalled();
      expect(result.items.length).toBe(2);
    });
  });
});
