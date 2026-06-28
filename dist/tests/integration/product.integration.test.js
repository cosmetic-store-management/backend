/**
 * product.integration.test.ts — Integration tests cho Product Service + Repository
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { connectTestDB, disconnectTestDB, clearCollections, } from "./helpers/db-helper.js";
import * as productService from "../../app/modules/product/product.service.js";
import Product from "../../app/models/product/product.schema.js";
import Category from "../../app/models/product/category.schema.js";
import Brand from "../../app/models/product/brand.schema.js";
import Variant from "../../app/models/product/variant.schema.js";
let categoryId;
let brandId;
beforeAll(async () => {
    await connectTestDB();
});
afterAll(async () => {
    await disconnectTestDB();
});
beforeEach(async () => {
    await clearCollections();
    const cat = await Category.create({
        name: "Skincare",
        slug: "skincare",
        isActive: true,
    });
    const brand = await Brand.create({
        name: "La Roche-Posay",
        slug: "la-roche-posay",
        isActive: true,
        imageUrl: "x.jpg",
        country: "France",
        description: "",
    });
    categoryId = cat._id.toString();
    brandId = brand._id.toString();
});
const makeProductInput = (overrides = {}) => ({
    name: "Kem Dưỡng Ẩm",
    categoryId,
    brandId,
    imageUrl: "https://example.com/img.jpg",
    variants: [{ name: "50ml", sku: "SKU-001", price: 150_000, stock: 50 }],
    ...overrides,
});
// ── createProduct ─────────────────────────────────────────────────────────────
describe("[Integration] Product — createProduct", () => {
    it("tạo product với slug đúng từ tên tiếng Việt", async () => {
        const result = await productService.createProduct(makeProductInput({ name: "Kem Dưỡng Ẩm" }));
        expect(result.slug).toBe("kem-duong-am");
        const inDB = await Product.findOne({ slug: "kem-duong-am" });
        expect(inDB).not.toBeNull();
    });
    it("tạo variants cùng lúc với product", async () => {
        await productService.createProduct(makeProductInput());
        const variants = await Variant.find({});
        expect(variants.length).toBeGreaterThan(0);
        expect(variants[0].name).toBe("50ml");
    });
    it("throw conflict khi slug trùng trong cùng category", async () => {
        await productService.createProduct(makeProductInput());
        await expect(productService.createProduct(makeProductInput())).rejects.toMatchObject({ status: 409 });
    });
    it("throw badRequest khi categoryId không tồn tại", async () => {
        await expect(productService.createProduct(makeProductInput({
            categoryId: "000000000000000000000000",
        }))).rejects.toMatchObject({ status: 400 });
    });
});
// ── getAdminProducts ──────────────────────────────────────────────────────────
describe("[Integration] Product — getAdminProducts", () => {
    beforeEach(async () => {
        // SKU phải unique — mỗi product dùng SKU riêng
        await productService.createProduct(makeProductInput({
            name: "Serum A",
            variants: [
                { name: "30ml", sku: "SKU-SERUM-A", price: 200_000, stock: 30 },
            ],
        }));
        await productService.createProduct(makeProductInput({
            name: "Toner B",
            variants: [
                { name: "150ml", sku: "SKU-TONER-B", price: 180_000, stock: 40 },
            ],
        }));
    });
    it("trả về danh sách đúng số lượng", async () => {
        const result = await productService.getAdminProducts({
            page: 1,
            limit: 10,
        });
        expect(result.products.length).toBe(2);
        expect(result.pagination.total).toBe(2);
    });
    it("phân trang hoạt động đúng", async () => {
        const p1 = await productService.getAdminProducts({ page: 1, limit: 1 });
        expect(p1.products.length).toBe(1);
        expect(p1.pagination.totalPages).toBe(2);
    });
});
// ── deleteProduct ─────────────────────────────────────────────────────────────
describe("[Integration] Product — deleteProduct", () => {
    it("xóa product và toàn bộ variants", async () => {
        const created = await productService.createProduct(makeProductInput());
        const productId = created.id;
        await productService.deleteProduct(productId);
        const deletedProduct = await Product.findById(productId);
        expect(deletedProduct).toBeNull();
        const orphanedVariants = await Variant.find({ productId });
        expect(orphanedVariants.length).toBe(0);
    });
});
// ── updateProduct ─────────────────────────────────────────────────────────────
describe("[Integration] Product — updateProduct", () => {
    it("cập nhật tên và slug thay đổi tương ứng", async () => {
        const created = await productService.createProduct(makeProductInput({ name: "Kem Gốc" }));
        const updated = await productService.updateProduct(created.id, {
            name: "Kem Mới",
        });
        expect(updated.name).toBe("Kem Mới");
        expect(updated.slug).toBe("kem-moi");
        const inDB = await Product.findById(created.id);
        expect(inDB?.slug).toBe("kem-moi");
    });
    it("throw conflict khi tên mới trùng slug với product khác trong cùng category", async () => {
        await productService.createProduct(makeProductInput({
            name: "Serum X",
            variants: [{ name: "30ml", sku: "SKU-SX", price: 100_000, stock: 10 }],
        }));
        const p2 = await productService.createProduct(makeProductInput({
            name: "Toner Y",
            variants: [{ name: "150ml", sku: "SKU-TY", price: 90_000, stock: 20 }],
        }));
        // Đổi tên Toner Y → Serum X (slug trùng)
        await expect(productService.updateProduct(p2.id, { name: "Serum X" })).rejects.toMatchObject({ status: 409 });
    });
    it("throw notFound khi id không tồn tại", async () => {
        const fakeId = new (await import("mongoose")).default.Types.ObjectId().toString();
        await expect(productService.updateProduct(fakeId, { name: "X" })).rejects.toMatchObject({ status: 404 });
    });
});
// ── updateProductStatus ───────────────────────────────────────────────────────
describe("[Integration] Product — updateProductStatus", () => {
    it("ẩn product thành công (isActive = false)", async () => {
        const created = await productService.createProduct(makeProductInput());
        await productService.updateProductStatus(created.id, false);
        const inDB = await Product.findById(created.id);
        expect(inDB?.isActive).toBe(false);
    });
    it("hiện product lại (isActive = true)", async () => {
        const created = await productService.createProduct(makeProductInput());
        await productService.updateProductStatus(created.id, false);
        await productService.updateProductStatus(created.id, true);
        const inDB = await Product.findById(created.id);
        expect(inDB?.isActive).toBe(true);
    });
});
