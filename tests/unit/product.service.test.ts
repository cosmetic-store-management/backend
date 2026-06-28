/**
 * product.service.test.ts — Unit tests cho Product Service
 * Kiểm tra: getAdminProducts (pagination/filter), createProduct (slug, validation), deleteProduct.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../app/modules/product/product.repository.js");
vi.mock("../../app/modules/product/dto/product.response.dto.js", () => ({
  mapProduct: (p: any) => ({
    id: p._id?.toString() ?? "pid",
    name: p.name,
    slug: p.slug,
  }),
}));
vi.mock("../../app/shared/helpers/sanitize.js", () => ({
  sanitizeRichText: (html: string) => html,
}));
vi.mock("../../app/models/product/variant.schema.js", () => ({
  default: {
    find: vi.fn().mockResolvedValue([]),
    insertMany: vi.fn().mockResolvedValue([]),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    aggregate: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("../../app/models/product/brand.schema.js", () => ({
  default: {
    findById: vi.fn().mockResolvedValue({ _id: "brand_xyz", name: "La Roche" }),
  },
}));

import * as productRepo from "../../app/modules/product/product.repository.js";
import * as productService from "../../app/modules/product/product.service.js";

const FAKE_CATEGORY_ID = "cat_abc";
const FAKE_BRAND_ID = "brand_xyz";

const makeFakeProduct = (
  overrides: Record<string, any> = {},
): Record<string, any> => ({
  _id: { toString: () => "product_id" },
  name: "Kem Dưỡng Ẩm",
  slug: "kem-duong-am",
  isActive: true,
  categoryId: FAKE_CATEGORY_ID,
  brandId: FAKE_BRAND_ID,
  save: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

beforeEach(() => vi.clearAllMocks());

// ── getAdminProducts ──────────────────────────────────────────────────────────

describe("productService.getAdminProducts", () => {
  it("trả về danh sách có phân trang", async () => {
    const fakeProducts = [
      makeFakeProduct(),
      makeFakeProduct({ name: "Serum" }),
    ];
    vi.mocked(productRepo.findAdmin).mockResolvedValue(fakeProducts as any);
    vi.mocked(productRepo.countAll).mockResolvedValue(2);

    const result = await productService.getAdminProducts({
      page: 1,
      limit: 10,
    });
    expect(result.products).toHaveLength(2);
    expect(result.pagination.total).toBe(2);
    expect(result.pagination.totalPages).toBe(1);
  });

  it("filter theo trạng thái active", async () => {
    vi.mocked(productRepo.findAdmin).mockResolvedValue([
      makeFakeProduct(),
    ] as any);
    vi.mocked(productRepo.countAll).mockResolvedValue(1);

    await productService.getAdminProducts({ status: "active" });

    expect(productRepo.findAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: true }),
      0,
      20,
    );
  });

  it("trả về trang 2 đúng với skip", async () => {
    vi.mocked(productRepo.findAdmin).mockResolvedValue([] as any);
    vi.mocked(productRepo.countAll).mockResolvedValue(25);

    const result = await productService.getAdminProducts({
      page: 2,
      limit: 10,
    });
    expect(productRepo.findAdmin).toHaveBeenCalledWith(
      expect.any(Object),
      10,
      10,
    ); // skip = (2-1)*10 = 10
    expect(result.pagination.page).toBe(2);
  });
});

// ── createProduct ─────────────────────────────────────────────────────────────

describe("productService.createProduct", () => {
  const validInput = {
    name: "Kem Dưỡng Ẩm",
    categoryId: FAKE_CATEGORY_ID,
    brandId: FAKE_BRAND_ID,
    imageUrl: "https://example.com/img.jpg",
    variants: [],
  };

  beforeEach(() => {
    // Brand mock đã được set ở top level
  });

  it("tạo sản phẩm thành công với dữ liệu hợp lệ", async () => {
    const fakeProduct = makeFakeProduct();
    vi.mocked(productRepo.findCategoryById).mockResolvedValue({
      _id: FAKE_CATEGORY_ID,
    } as any);
    vi.mocked(productRepo.findOneBy).mockResolvedValueOnce(null); // slug chưa tồn tại
    vi.mocked(productRepo.create).mockResolvedValue(fakeProduct as any);
    vi.mocked(productRepo.findById).mockResolvedValue(fakeProduct as any);

    const result = await productService.createProduct(validInput as any);
    expect(productRepo.create).toHaveBeenCalledOnce();
    expect(result.slug).toBe("kem-duong-am");
  });

  it("throw badRequest khi categoryId không tồn tại", async () => {
    vi.mocked(productRepo.findCategoryById).mockResolvedValue(null);

    await expect(
      productService.createProduct(validInput as any),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("slug được tạo đúng từ tên tiếng Việt", async () => {
    const fakeProduct = makeFakeProduct({
      name: "Kem Dưỡng Da Mặt",
      slug: "kem-duong-da-mat",
    });
    vi.mocked(productRepo.findCategoryById).mockResolvedValue({
      _id: FAKE_CATEGORY_ID,
    } as any);
    vi.mocked(productRepo.findOneBy).mockResolvedValueOnce(null);
    vi.mocked(productRepo.create).mockResolvedValue(fakeProduct as any);
    vi.mocked(productRepo.findById).mockResolvedValue(fakeProduct as any);

    const result = await productService.createProduct({
      ...validInput,
      name: "Kem Dưỡng Da Mặt",
    } as any);
    expect(result.slug).toBe("kem-duong-da-mat");
  });
});

// ── deleteProduct ─────────────────────────────────────────────────────────────

describe("productService.deleteProduct", () => {
  it("xóa product và variants thành công", async () => {
    vi.mocked(productRepo.findOneBy).mockResolvedValue(
      makeFakeProduct() as any,
    );
    vi.mocked(productRepo.findByIdAndDelete).mockResolvedValue(
      undefined as any,
    );

    await productService.deleteProduct("product_id");

    expect(productRepo.findByIdAndDelete).toHaveBeenCalledWith("product_id");
  });

  it("throw notFound khi product không tồn tại", async () => {
    vi.mocked(productRepo.findOneBy).mockResolvedValue(null);

    await expect(
      productService.deleteProduct("non_existent_id"),
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ── updateProduct ─────────────────────────────────────────────────────────────

describe("productService.updateProduct", () => {
  it("cập nhật name và slug tự động thay đổi", async () => {
    const fakeProduct = makeFakeProduct({ name: "Cũ", slug: "cu" });
    const updatedProduct = makeFakeProduct({ name: "Mới", slug: "moi" });

    vi.mocked(productRepo.findDocumentById).mockResolvedValueOnce(fakeProduct as any); // tìm product
    vi.mocked(productRepo.findOneBy).mockResolvedValueOnce(null); // slug mới chưa tồn tại
    vi.mocked(productRepo.save).mockResolvedValue(undefined as any);
    vi.mocked(productRepo.findById).mockResolvedValue(updatedProduct as any);

    await productService.updateProduct("product_id", { name: "Mới" });

    expect(fakeProduct.name).toBe("Mới");
    expect(fakeProduct.slug).toBe("moi");
    expect(productRepo.save).toHaveBeenCalledWith(fakeProduct);
  });

  it("throw conflict khi slug mới đã tồn tại trong cùng category", async () => {
    const fakeProduct = makeFakeProduct();
    const conflictProduct = makeFakeProduct({
      _id: { toString: () => "other_id" },
    });

    vi.mocked(productRepo.findDocumentById).mockResolvedValueOnce(fakeProduct as any); // tìm product
    vi.mocked(productRepo.findOneBy)
      .mockResolvedValueOnce(conflictProduct as any); // slug đã tồn tại

    await expect(
      productService.updateProduct("product_id", { name: "Kem Dưỡng Ẩm" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("throw badRequest khi categoryId mới không tồn tại", async () => {
    vi.mocked(productRepo.findDocumentById).mockResolvedValueOnce(
      makeFakeProduct() as any,
    );
    vi.mocked(productRepo.findCategoryById).mockResolvedValue(null);

    await expect(
      productService.updateProduct("product_id", { categoryId: "invalid_cat" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throw notFound khi product không tồn tại", async () => {
    vi.mocked(productRepo.findDocumentById).mockResolvedValue(null);

    await expect(
      productService.updateProduct("bad_id", { name: "X" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("update imageUrl mà không đổi slug", async () => {
    const fakeProduct = makeFakeProduct({ imageUrl: "old.jpg" });
    const updated = makeFakeProduct({ imageUrl: "new.jpg" });

    vi.mocked(productRepo.findDocumentById).mockResolvedValueOnce(fakeProduct as any);
    vi.mocked(productRepo.save).mockResolvedValue(undefined as any);
    vi.mocked(productRepo.findById).mockResolvedValue(updated as any);

    await productService.updateProduct("product_id", { imageUrl: "new.jpg" });
    expect(fakeProduct.imageUrl).toBe("new.jpg");
    // slug không thay đổi khi không đổi name
    expect(fakeProduct.slug).toBe("kem-duong-am");
  });
});

// ── updateProductStatus ───────────────────────────────────────────────────────

describe("productService.updateProductStatus", () => {
  it("ẩn product (isActive = false) thành công", async () => {
    const fakeProduct = makeFakeProduct({ isActive: true });
    vi.mocked(productRepo.findDocumentBy).mockResolvedValueOnce(fakeProduct as any);
    vi.mocked(productRepo.save).mockResolvedValue(undefined as any);
    vi.mocked(productRepo.findById).mockResolvedValue({
      ...fakeProduct,
      isActive: false,
    } as any);

    await productService.updateProductStatus("product_id", false);
    expect(fakeProduct.isActive).toBe(false);
    expect(productRepo.save).toHaveBeenCalledWith(fakeProduct);
  });

  it("throw notFound khi product không tồn tại", async () => {
    vi.mocked(productRepo.findDocumentBy).mockResolvedValue(null);

    await expect(
      productService.updateProductStatus("bad_id", false),
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ── getPublicProductDetail ────────────────────────────────────────────────────

describe("productService.getPublicProductDetail", () => {
  it("trả về product khi slug hợp lệ", async () => {
    const fakeProduct = makeFakeProduct();
    // getPublicProductDetail dùng findBySlug (không phải findOneBy)
    vi.mocked(productRepo.findBySlug).mockResolvedValue(fakeProduct as any);
    vi.mocked(productRepo.findById).mockResolvedValue(null); // slug path, không phải ObjectId

    const result = await productService.getPublicProductDetail("kem-duong-am");
    expect(result.slug).toBe("kem-duong-am");
  });

  it("throw notFound khi slug không tồn tại", async () => {
    vi.mocked(productRepo.findById).mockResolvedValue(null);
    vi.mocked(productRepo.findBySlug).mockResolvedValue(null);

    await expect(
      productService.getPublicProductDetail("non-existent"),
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ── getAdminProductDetail ─────────────────────────────────────────────────────

describe("productService.getAdminProductDetail", () => {
  it("trả về product theo id", async () => {
    const fakeProduct = makeFakeProduct();
    vi.mocked(productRepo.findOneBy).mockResolvedValue(fakeProduct as any);

    const result = await productService.getAdminProductDetail("product_id");
    expect(result.id).toBe("product_id");
  });

  it("throw notFound khi id không tồn tại", async () => {
    vi.mocked(productRepo.findOneBy).mockResolvedValue(null);

    await expect(
      productService.getAdminProductDetail("bad_id"),
    ).rejects.toMatchObject({ status: 404 });
  });
});
