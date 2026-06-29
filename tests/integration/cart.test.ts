import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { app } from "../../server.js";
import User from "../../app/modules/user/models/user.schema.js";
import jwt from "jsonwebtoken";
import { connectTestDB, disconnectTestDB, clearCollections } from "./helpers/db-helper.js";

describe("Cart Integration Tests", () => {
  let token: string;
  let userId: string;

  beforeAll(async () => {
    await connectTestDB();
    // Create a dummy user
    const user = await User.create({
      name: "Test User",
      email: "testcart@example.com",
      phone: "0999999999",
      password: "password123",
      role: "customer",
      isActive: true,
    });
    userId = user.id;

    // Generate JWT token
    token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: "1h" }
    );
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  describe("GET /api/cart", () => {
    it("should return 401 if no token provided", async () => {
      const res = await request(app).get("/api/cart");
      expect(res.status).toBe(401);
    });

    it("should return cart if valid token provided", async () => {
      const res = await request(app)
        .get("/api/cart")
        .set("Authorization", `Bearer ${token}`);
      
      expect(res.status).toBe(200);
      expect(res.body.userId).toBe(userId);
      expect(res.body.items).toBeInstanceOf(Array);
    });
  });

  describe("POST /api/cart/items", () => {
    it("should return 400 for invalid item data", async () => {
      const res = await request(app)
        .post("/api/cart/items")
        .set("Authorization", `Bearer ${token}`)
        .send({ variantId: "invalid", quantity: -1 });
      
      expect(res.status).toBe(400); // Zod validation error
    });
  });
});
