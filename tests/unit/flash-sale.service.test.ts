import { describe, it, expect, vi, beforeEach } from "vitest";
import * as flashSaleService from "../../app/modules/marketing/flash-sale.service.js";
import * as flashSaleRepo from "../../app/modules/marketing/flash-sale.repository.js";
import mongoose from "mongoose";

vi.mock("../../app/modules/marketing/flash-sale.repository.js");

const makeFakeFlashSale = (overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  name: "Siêu sale 6/6",
  startTime: new Date(Date.now() - 3600000),
  endTime: new Date(Date.now() + 3600000),
  isActive: true,
  items: [
    {
      productId: { _id: new mongoose.Types.ObjectId(), name: "Product A" },
      variantId: { _id: new mongoose.Types.ObjectId(), name: "Variant A" },
      flashPrice: 50000,
      quantityLimit: 100,
      soldQuantity: 10,
    },
  ],
  ...overrides,
});

describe("Flash Sale Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getActiveFlashSale", () => {
    it("trả về flash sale đang active", async () => {
      const fakeFs = makeFakeFlashSale();
      vi.mocked(flashSaleRepo.findActiveFlashSale).mockResolvedValue(fakeFs as any);

      const result = await flashSaleService.getActiveFlashSale();
      expect(result?.name).toBe("Siêu sale 6/6");
    });

    it("trả về null nếu không có flash sale nào active", async () => {
      vi.mocked(flashSaleRepo.findActiveFlashSale).mockResolvedValue(null);

      const result = await flashSaleService.getActiveFlashSale();
      expect(result).toBeNull();
    });
  });

  describe("createFlashSale", () => {
    it("tạo flash sale thành công", async () => {
      const fakeFs = makeFakeFlashSale();
      vi.mocked(flashSaleRepo.create).mockResolvedValue(fakeFs as any);
      vi.mocked(flashSaleRepo.findById).mockResolvedValue(fakeFs as any);

      const payload = {
        name: "Sale mới",
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        isActive: true,
        items: [
          {
            productId: new mongoose.Types.ObjectId().toString(),
            variantId: new mongoose.Types.ObjectId().toString(),
            flashPrice: 100000,
            quantityLimit: 50,
          },
        ],
      };

      const result = await flashSaleService.createFlashSale(payload);
      expect(result.name).toBe("Siêu sale 6/6"); // Vì mock trả về fakeFs
      expect(flashSaleRepo.create).toHaveBeenCalled();
    });
  });

  describe("updateFlashSale", () => {
    it("throw badRequest khi ID không hợp lệ", async () => {
      await expect(flashSaleService.updateFlashSale("invalid_id", {} as any)).rejects.toMatchObject({
        status: 400,
        message: "ID không hợp lệ",
      });
    });

    it("throw notFound khi flash sale không tồn tại", async () => {
      const validId = new mongoose.Types.ObjectId().toString();
      vi.mocked(flashSaleRepo.findById).mockResolvedValue(null);

      await expect(flashSaleService.updateFlashSale(validId, {} as any)).rejects.toMatchObject({
        status: 404,
        message: "Flash Sale không tồn tại",
      });
    });

    it("giữ nguyên soldQuantity khi update item cũ", async () => {
      const validId = new mongoose.Types.ObjectId().toString();
      const variantIdString = new mongoose.Types.ObjectId().toString();
      
      const fakeFs = makeFakeFlashSale({
        items: [
          {
            productId: { _id: new mongoose.Types.ObjectId(), name: "Product A", slug: "product-a" },
            variantId: { _id: { toString: () => variantIdString } },
            soldQuantity: 25,
          }
        ]
      });

      vi.mocked(flashSaleRepo.findById).mockResolvedValue(fakeFs as any);
      vi.mocked(flashSaleRepo.update).mockResolvedValue(fakeFs as any);

      await flashSaleService.updateFlashSale(validId, {
        items: [
          {
            productId: new mongoose.Types.ObjectId().toString(),
            variantId: variantIdString,
            flashPrice: 80000,
            quantityLimit: 200,
          }
        ]
      } as any);

      expect(flashSaleRepo.update).toHaveBeenCalledWith(validId, expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ soldQuantity: 25 })
        ])
      }));
    });
  });

  describe("deleteFlashSale", () => {
    it("throw badRequest khi ID không hợp lệ", async () => {
      await expect(flashSaleService.deleteFlashSale("invalid_id")).rejects.toMatchObject({
        status: 400,
        message: "ID không hợp lệ",
      });
    });

    it("throw notFound khi flash sale không tồn tại", async () => {
      const validId = new mongoose.Types.ObjectId().toString();
      vi.mocked(flashSaleRepo.findById).mockResolvedValue(null);

      await expect(flashSaleService.deleteFlashSale(validId)).rejects.toMatchObject({
        status: 404,
        message: "Flash Sale không tồn tại",
      });
    });

    it("xóa thành công", async () => {
      const validId = new mongoose.Types.ObjectId().toString();
      vi.mocked(flashSaleRepo.findById).mockResolvedValue(makeFakeFlashSale() as any);
      vi.mocked(flashSaleRepo.deleteById).mockResolvedValue(undefined as any);

      const result = await flashSaleService.deleteFlashSale(validId);
      expect(result.message).toBe("Xóa thành công");
      expect(flashSaleRepo.deleteById).toHaveBeenCalledWith(validId);
    });
  });
});
