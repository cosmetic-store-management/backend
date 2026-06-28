/**
 * auth.integration.test.ts — Integration tests cho Auth Service + Repository
 * Sử dụng mongodb-memory-server để test Service + Repository cùng nhau với DB thật.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  connectTestDB,
  disconnectTestDB,
  clearCollections,
} from "./helpers/db-helper.js";

// Import real implementations (không mock)
import * as authService from "../../app/modules/auth/auth.service.js";
import User from "../../app/models/user/user.schema.js";

beforeAll(async () => {
  process.env.JWT_SECRET = "integration_test_secret_32chars!!";
  process.env.JWT_REFRESH_SECRET = "integration_refresh_secret_32ch!!";
  await connectTestDB();
});
afterAll(async () => {
  await disconnectTestDB();
});
beforeEach(async () => {
  await clearCollections();
});

// ── register + login flow ─────────────────────────────────────────────────────

describe("[Integration] Auth — register → login flow", () => {
  const newUser = {
    name: "Nguyễn Test",
    phone: "0901111111",
    email: "test@example.com",
    password: "StrongPass@123",
  };

  it("đăng ký tạo ra user trong DB với password đã hash", async () => {
    const result = await authService.register(newUser);

    expect(result.user.phone).toBe("0901111111");
    expect(result.accessToken).toBeTruthy();

    // Kiểm tra password thực sự đã hash trong DB
    const dbUser = await User.findOne({ phone: "0901111111" });
    expect(dbUser?.password).not.toBe(newUser.password);
    expect(dbUser?.password).toMatch(/^\$2/); // bcrypt format
  });

  it("đăng nhập public thành công sau khi đăng ký", async () => {
    await authService.register(newUser);
    const result = await authService.loginPublic({
      phone: "0901111111",
      password: "StrongPass@123",
    });

    expect(result.user.name).toBe("Nguyễn Test");
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
  });

  it("đăng ký hai lần với cùng phone sẽ throw conflict", async () => {
    await authService.register(newUser);
    await expect(authService.register(newUser)).rejects.toMatchObject({
      status: 409,
    });
  });
});

// ── refresh token rotation ────────────────────────────────────────────────────

describe("[Integration] Auth — refresh token rotation", () => {
  it("refresh token rotation cấp token mới và GIỮ NGUYÊN refresh token cũ (để tránh lỗi race condition)", async () => {
    const { refreshToken: oldRefreshToken } = await authService.register({
      name: "User A",
      phone: "0902222222",
      email: "usera@example.com",
      password: "Pass@123",
    });

    const { accessToken: newAccess, refreshToken: newRefresh } =
      await authService.refreshAccessToken(oldRefreshToken);

    expect(newAccess).toBeTruthy();
    expect(newRefresh).toBe(oldRefreshToken); // token giữ nguyên
  });
});

// ── change password ───────────────────────────────────────────────────────────

describe("[Integration] Auth — changePassword", () => {
  it("đổi mật khẩu thành công, đăng nhập lại với mật khẩu mới", async () => {
    const { user } = await authService.register({
      name: "User B",
      phone: "0903333333",
      email: "userb@example.com",
      password: "OldPass@123",
    });

    await authService.changePassword(user.id, {
      currentPassword: "OldPass@123",
      newPassword: "NewPass@456",
    });

    // Đăng nhập với mật khẩu mới phải thành công
    const result = await authService.loginPublic({
      phone: "0903333333",
      password: "NewPass@456",
    });
    expect(result.user.id).toBe(user.id);

    // Đăng nhập với mật khẩu cũ phải thất bại
    await expect(
      authService.loginPublic({ phone: "0903333333", password: "OldPass@123" }),
    ).rejects.toMatchObject({ status: 401 });
  });
});
