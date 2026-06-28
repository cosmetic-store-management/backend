import { describe, it, expect, vi, beforeEach } from "vitest";
import * as brandService from "../../app/modules/brand/brand.service.js";
import * as brandRepo from "../../app/modules/brand/brand.repository.js";
vi.mock("../../app/modules/brand/brand.repository.js");
vi.mock("../../app/models/product/product.schema.js", () => ({
    default: {
        aggregate: vi.fn().mockResolvedValue([{ _id: "647a9f9c9b1d8b001a1d1d1d", count: 10 }]),
        countDocuments: vi.fn().mockResolvedValue(0),
    },
}));
const validObjectId = "647a9f9c9b1d8b001a1d1d1d";
const makeFakeBrand = (overrides = {}) => ({
    _id: { toString: () => validObjectId },
    name: "L'Oreal",
    slug: "loreal",
    description: "",
    imageUrl: "",
    country: "Pháp",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
});
describe("Brand Service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    describe("getAdminBrands", () => {
        it("trả về danh sách thương hiệu có phân trang và số lượng SP", async () => {
            vi.mocked(brandRepo.findAll).mockResolvedValue([makeFakeBrand()]);
            vi.mocked(brandRepo.countAll).mockResolvedValue(1);
            const result = await brandService.getAdminBrands({ page: 1, limit: 10 });
            expect(result.brands).toHaveLength(1);
            // Aggregate mock returns 10 for brand_id
            expect(result.brands[0].productCount).toBe(10);
            expect(result.pagination.total).toBe(1);
        });
    });
    describe("createBrand", () => {
        it("tạo thương hiệu thành công", async () => {
            vi.mocked(brandRepo.findBySlug).mockResolvedValue(null);
            vi.mocked(brandRepo.create).mockResolvedValue(makeFakeBrand());
            const result = await brandService.createBrand({ name: "L'Oreal" });
            expect(result.name).toBe("L'Oreal");
            expect(result.slug).toBe("loreal");
        });
        it("throw conflict khi slug đã tồn tại", async () => {
            vi.mocked(brandRepo.findBySlug).mockResolvedValue(makeFakeBrand());
            await expect(brandService.createBrand({ name: "L'Oreal" })).rejects.toMatchObject({
                status: 409,
            });
        });
    });
    describe("updateBrand", () => {
        it("cập nhật name và slug thành công", async () => {
            const brand = makeFakeBrand();
            vi.mocked(brandRepo.findById).mockResolvedValue(brand);
            vi.mocked(brandRepo.findOneBy).mockResolvedValue(null); // slug mới không trùng
            vi.mocked(brandRepo.save).mockResolvedValue(brand);
            const result = await brandService.updateBrand(validObjectId, { name: "Mới" });
            expect(brand.name).toBe("Mới");
            expect(brand.slug).toBe("moi");
        });
    });
    describe("deleteBrand", () => {
        it("xóa thương hiệu thành công khi không có sản phẩm", async () => {
            const brand = makeFakeBrand();
            vi.mocked(brandRepo.findById).mockResolvedValue(brand);
            // Override aggregate to return 0 for this test
            const { default: Product } = await import("../../app/models/product/product.schema.js");
            vi.mocked(Product.countDocuments).mockResolvedValueOnce(0);
            vi.mocked(brandRepo.deleteById).mockResolvedValue(undefined);
            await brandService.deleteBrand(validObjectId);
            expect(brandRepo.deleteById).toHaveBeenCalledWith(validObjectId);
        });
        it("throw badRequest khi thương hiệu đang có sản phẩm", async () => {
            const brand = makeFakeBrand();
            vi.mocked(brandRepo.findById).mockResolvedValue(brand);
            const { default: Product } = await import("../../app/models/product/product.schema.js");
            vi.mocked(Product.countDocuments).mockResolvedValueOnce(5);
            await expect(brandService.deleteBrand(validObjectId)).rejects.toMatchObject({
                status: 409,
            });
        });
    });
});
