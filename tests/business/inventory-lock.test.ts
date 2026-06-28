import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import Product from "../../app/models/product/product.schema.js";
import Variant from "../../app/models/product/variant.schema.js";
import Setting from "../../app/models/system/setting.schema.js";
import "../../app/models/index.js";
import { createOrder } from "../../app/modules/order/checkout/checkout.service.js";

describe("Concurrency Business Rules: Inventory Lock", () => {
  let mongoServer: MongoMemoryReplSet;
  let testProductId: string;
  let testVariantId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongoServer.getUri());

    const product = await Product.create({
      name: "Test Race Condition Product",
      slug: "test-race-condition",
      description: "Desc",
      price: 100,
      stock: 2, // Chỉ có 2 sản phẩm tồn kho
      images: [],
      categoryId: new mongoose.Types.ObjectId(),
      brandId: new mongoose.Types.ObjectId(),
    } as any);
    testProductId = product._id.toString();

    const variant = await Variant.create({
      productId: product._id,
      name: "Màu Đỏ",
      sku: "TEST-RACE-RED",
      price: 100,
      stock: 2, // Chỉ có 2 sản phẩm
    } as any);
    testVariantId = variant._id.toString();

    await Setting.create({
      key: "general_settings",
      value: { defaultShippingFee: 0, freeshipThreshold: 1000 },
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it("should prevent overselling when multiple orders are created concurrently", async () => {
    // Giả lập 5 người cùng mua đồng thời lúc 12:00, mỗi người mua 1 sản phẩm
    // Tồn kho chỉ có 2, nên chỉ có 2 request thành công, 3 request thất bại.
    const orderPromises = Array.from({ length: 5 }).map((_, idx) => {
      const orderData = {
        items: [
          {
            productId: testProductId,
            variantId: testVariantId,
            quantity: 1,
            price: 100
          }
        ],
        receiverName: `User ${idx}`,
        phone: "0123456789",
        province: "HN",
        district: "BD",
        ward: "TX",
        street: "123",
        paymentMethod: "cod" as const,
        shippingFee: 0,
        subtotal: 100,
        totalAmount: 100,
      };

      // Mock user context
      const reqUser = { _id: new mongoose.Types.ObjectId(), name: `User ${idx}` } as any;

      return createOrder(reqUser, orderData as any).catch(err => err);
    });

    const results = await Promise.all(orderPromises);
    
    // Đếm số đơn hàng thành công (không phải là Error)
    const successCount = results.filter(r => !(r instanceof Error)).length;
    const failCount = results.filter(r => r instanceof Error).length;

    console.log("TEST RESULTS:", results);

    // Do tính chất Transaction Write Conflict của MongoDB, số lượng success có thể là 1 hoặc 2 (nhưng không bao giờ > 2)
    // vì stock = 2. Các request khác sẽ bị huỷ (Write Conflict hoặc Hết Hàng)
    expect(successCount).toBeLessThanOrEqual(2);
    expect(failCount).toBeGreaterThanOrEqual(3);

    const variantAfter = await Variant.findById(testVariantId);
    expect(variantAfter?.stock).toBeGreaterThanOrEqual(0);
  });
});
