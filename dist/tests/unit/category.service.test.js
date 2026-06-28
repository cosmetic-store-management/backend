import { describe, it, expect, vi, beforeEach } from "vitest";
import * as categoryService from "../../app/modules/category/category.service.js";
import * as categoryRepo from "../../app/modules/category/category.repository.js";
vi.mock("../../app/modules/category/category.repository.js");
const validObjectId = "647a9f9c9b1d8b001a1d1d1d";
const makeFakeCategory = (overrides = {}) => ({
    _id: { toString: () => validObjectId },
    name: "Dưỡng da",
    slug: "duong-da",
    description: "",
    imageUrl: "",
    iconUrl: "",
    bannerUrl: "",
    parentId: null,
    isActive: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
});
describe("Category Service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    describe("getAdminCategories", () => {
        it("trả về danh sách danh mục có phân trang", async () => {
            vi.mocked(categoryRepo.findAll).mockResolvedValue([makeFakeCategory()]);
            vi.mocked(categoryRepo.countAll).mockResolvedValue(1);
            vi.mocked(categoryRepo.countProductsByCategoryIds).mockResolvedValue(new Map([[validObjectId, 5]]));
            const result = await categoryService.getAdminCategories({ page: 1, limit: 10 });
            expect(result.categories).toHaveLength(1);
            expect(result.categories[0].productCount).toBe(5);
            expect(result.pagination.total).toBe(1);
        });
    });
    describe("createCategory", () => {
        it("tạo danh mục thành công", async () => {
            vi.mocked(categoryRepo.findBySlug).mockResolvedValue(null);
            vi.mocked(categoryRepo.create).mockResolvedValue(makeFakeCategory());
            const result = await categoryService.createCategory({ name: "Dưỡng da" });
            expect(result.name).toBe("Dưỡng da");
        });
        it("throw conflict khi slug đã tồn tại", async () => {
            vi.mocked(categoryRepo.findBySlug).mockResolvedValue(makeFakeCategory());
            await expect(categoryService.createCategory({ name: "Dưỡng da" })).rejects.toMatchObject({
                status: 409,
            });
        });
        it("throw notFound khi parentId không tồn tại", async () => {
            vi.mocked(categoryRepo.findBySlug).mockResolvedValue(null);
            vi.mocked(categoryRepo.findById).mockResolvedValue(null);
            await expect(categoryService.createCategory({ name: "Child", parentId: "6a320f2b656150003571c5c6" })).rejects.toMatchObject({ status: 404 });
        });
    });
    describe("updateCategory", () => {
        it("cập nhật name và slug thành công", async () => {
            const cat = makeFakeCategory();
            vi.mocked(categoryRepo.findById).mockResolvedValue(cat);
            vi.mocked(categoryRepo.findOneBy).mockResolvedValue(null);
            vi.mocked(categoryRepo.save).mockResolvedValue(cat);
            const result = await categoryService.updateCategory(validObjectId, { name: "Mới" });
            expect(cat.name).toBe("Mới");
            expect(cat.slug).toBe("moi");
        });
        it("throw badRequest khi tự gán parentId cho chính mình", async () => {
            const cat = makeFakeCategory();
            vi.mocked(categoryRepo.findById).mockResolvedValue(cat);
            // Giả lập valid parent
            vi.mocked(categoryRepo.findById).mockImplementation(async (id) => {
                if (id === validObjectId)
                    return cat;
                return null;
            });
            await expect(categoryService.updateCategory(validObjectId, { parentId: validObjectId })).rejects.toMatchObject({
                status: 400,
                message: "Danh mục không thể là cha của chính nó",
            });
        });
    });
    describe("deleteCategory", () => {
        it("xóa danh mục thành công", async () => {
            const cat = makeFakeCategory();
            vi.mocked(categoryRepo.findById).mockResolvedValue(cat);
            vi.mocked(categoryRepo.hasProducts).mockResolvedValue(false);
            vi.mocked(categoryRepo.deleteById).mockResolvedValue(undefined);
            await categoryService.deleteCategory(validObjectId);
            expect(categoryRepo.deleteById).toHaveBeenCalledWith(validObjectId);
        });
        it("throw badRequest khi danh mục đang có sản phẩm", async () => {
            vi.mocked(categoryRepo.findById).mockResolvedValue(makeFakeCategory());
            vi.mocked(categoryRepo.hasProducts).mockResolvedValue(true);
            await expect(categoryService.deleteCategory(validObjectId)).rejects.toMatchObject({
                status: 400,
                message: "Không thể xóa danh mục đang có sản phẩm",
            });
        });
    });
});
