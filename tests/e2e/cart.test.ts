import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../server.js";
import User from "../../app/models/user/user.schema.js";
import { connectTestDB, disconnectTestDB } from "../integration/helpers/db-helper.js";

describe("Cart E2E Flow", () => {
  let token: string;
  let userId: string;

  beforeAll(async () => {
    await connectTestDB();
    // 1. Register a new user
    const res = await request(app).post("/api/auth/register").send({
      name: "E2E Cart User",
      email: "e2ecart@example.com",
      phone: "0999888777",
      password: "password123",
      confirmPassword: "password123"
    });

    // 2. Login to get token
    const loginRes = await request(app).post("/api/auth/public/login").send({
      phone: "0999888777",
      password: "password123"
    });

    token = loginRes.body.data.accessToken;
    userId = loginRes.body.data.user.id;
  });

  afterAll(async () => {
    if (userId) {
      await User.findByIdAndDelete(userId);
    }
    await disconnectTestDB();
  });

  it("should sync cart correctly after login", async () => {
    // Send local cart to sync
    const syncRes = await request(app)
      .post("/api/cart/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [] // In a real E2E we might mock variantIds, but here we just test if the endpoint is alive
      });
    
    expect(syncRes.status).toBe(200);
    expect(syncRes.body.userId).toBe(userId);
    expect(syncRes.body.items).toBeInstanceOf(Array);
  });
});
