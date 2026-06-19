/**
 * auth.service.test.ts — Unit tests cho Auth Service
 * Strategy: Mock toàn bộ authRepo và external dependencies để test business logic thuần túy.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies trước khi import service
vi.mock("../../app/modules/auth/auth.repository.js");
vi.mock("../../app/modules/user/dto/user.response.dto.js", () => ({
  mapUser: (user: any) => ({ id: user._id?.toString() ?? "uid", name: user.name, role: user.role }),
}));
vi.mock("../../app/shared/email/email.service.js", () => ({
  sendResetPasswordEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("bcryptjs", () => ({
  default: {
    hash:    vi.fn().mockResolvedValue("hashed_password"),
    compare: vi.fn(),
  },
}));
vi.mock("jsonwebtoken", () => ({
  default: {
    sign:   vi.fn().mockReturnValue("mock_token"),
    verify: vi.fn(),
  },
}));

import * as authRepo from "../../app/modules/auth/auth.repository.js";
import * as authService from "../../app/modules/auth/auth.service.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// Helper để tạo fake user document
const makeFakeUser = (overrides: Record<string, any> = {}) => ({
  _id:         { toString: () => "user_id_123" },
  name:        "Nguyễn Văn A",
  phone:       "0901234567",
  email:       "test@example.com",
  password:    "hashed_password",
  role:        "customer",
  isActive:    true,
  points:      0,
  refreshToken: undefined,
  save:        vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET         = "test_secret";
  process.env.JWT_REFRESH_SECRET = "test_refresh_secret";
});

// ── register ──────────────────────────────────────────────────────────────────

describe("authService.register", () => {
  it("tạo user mới thành công khi phone chưa tồn tại", async () => {
    const fakeUser = makeFakeUser();
    vi.mocked(authRepo.findByPhone).mockResolvedValue(null);
    vi.mocked(authRepo.findByEmail).mockResolvedValue(null);
    vi.mocked(authRepo.create).mockResolvedValue(fakeUser as any);
    vi.mocked(authRepo.save).mockResolvedValue(undefined as any);

    const result = await authService.register({
      name: "Nguyễn Văn A", phone: "0901234567",
      email: "test@example.com", password: "password123",
    });

    expect(result.accessToken).toBe("mock_token");
    expect(result.refreshToken).toBe("mock_token");
    expect(authRepo.create).toHaveBeenCalledOnce();
  });

  it("throw conflict khi phone đã tồn tại và có password", async () => {
    const existingUser = makeFakeUser({ password: "hashed" });
    vi.mocked(authRepo.findByPhone).mockResolvedValue(existingUser as any);

    await expect(authService.register({
      name: "Test", phone: "0901234567", email: "t@example.com", password: "pass123",
    })).rejects.toMatchObject({ status: 409 });
  });

  it("throw conflict khi email đã tồn tại ở user khác", async () => {
    vi.mocked(authRepo.findByPhone).mockResolvedValue(null);
    vi.mocked(authRepo.findByEmail).mockResolvedValue(makeFakeUser({ _id: { toString: () => "other_id" } }) as any);

    await expect(authService.register({
      name: "Test", phone: "0901111111",
      email: "dupe@example.com", password: "pass123",
    })).rejects.toMatchObject({ status: 409 });
  });
});

// ── loginAdmin ────────────────────────────────────────────────────────────────

describe("authService.loginAdmin", () => {
  it("đăng nhập admin thành công với đúng credentials", async () => {
    const adminUser = makeFakeUser({ role: "owner" });
    vi.mocked(authRepo.findByEmail).mockResolvedValue(adminUser as any);
    vi.mocked(authRepo.findByIdWithRefreshToken).mockResolvedValue(adminUser as any);
    vi.mocked(bcrypt.compare as any).mockResolvedValue(true);

    const result = await authService.loginAdmin({ email: "admin@example.com", password: "pass" });
    expect(result.user.role).toBe("owner");
    expect(result.accessToken).toBeTruthy();
  });

  it("throw unauthorized khi password sai", async () => {
    const adminUser = makeFakeUser({ role: "owner" });
    vi.mocked(authRepo.findByEmail).mockResolvedValue(adminUser as any);
    vi.mocked(bcrypt.compare as any).mockResolvedValue(false);

    await expect(authService.loginAdmin({ email: "admin@example.com", password: "wrong" }))
      .rejects.toMatchObject({ status: 401 });
  });

  it("throw unauthorized khi role là customer", async () => {
    const customerUser = makeFakeUser({ role: "customer" });
    vi.mocked(authRepo.findByEmail).mockResolvedValue(customerUser as any);
    vi.mocked(bcrypt.compare as any).mockResolvedValue(true);

    await expect(authService.loginAdmin({ email: "c@example.com", password: "pass" }))
      .rejects.toMatchObject({ status: 401 });
  });

  it("throw unauthorized khi tài khoản bị khóa (isActive = false)", async () => {
    const lockedUser = makeFakeUser({ role: "staff", isActive: false });
    vi.mocked(authRepo.findByEmail).mockResolvedValue(lockedUser as any);

    await expect(authService.loginAdmin({ email: "locked@example.com", password: "pass" }))
      .rejects.toMatchObject({ status: 401 });
  });
});

// ── loginPublic ───────────────────────────────────────────────────────────────

describe("authService.loginPublic", () => {
  it("đăng nhập customer thành công", async () => {
    const customer = makeFakeUser({ role: "customer" });
    vi.mocked(authRepo.findByPhone).mockResolvedValue(customer as any);
    vi.mocked(authRepo.findByIdWithRefreshToken).mockResolvedValue(customer as any);
    vi.mocked(bcrypt.compare as any).mockResolvedValue(true);

    const result = await authService.loginPublic({ phone: "0901234567", password: "pass" });
    expect(result.user.role).toBe("customer");
  });

  it("throw unauthorized khi tài khoản admin cố đăng nhập storefront", async () => {
    const adminUser = makeFakeUser({ role: "owner" });
    vi.mocked(authRepo.findByPhone).mockResolvedValue(adminUser as any);

    await expect(authService.loginPublic({ phone: "0901234567", password: "pass" }))
      .rejects.toMatchObject({ status: 401 });
  });
});

// ── refreshAccessToken ────────────────────────────────────────────────────────

describe("authService.refreshAccessToken", () => {
  it("cấp token mới khi refresh token hợp lệ", async () => {
    const user = makeFakeUser({ refreshToken: "valid_refresh_token" });
    vi.mocked(jwt.verify as any).mockReturnValue({ id: "user_id_123" });
    vi.mocked(authRepo.findByIdWithRefreshToken).mockResolvedValue(user as any);

    const result = await authService.refreshAccessToken("valid_refresh_token");
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
  });

  it("throw unauthorized khi JWT verify thất bại", async () => {
    vi.mocked(jwt.verify as any).mockImplementation(() => { throw new Error("expired"); });

    await expect(authService.refreshAccessToken("bad_token"))
      .rejects.toMatchObject({ status: 401 });
  });

  it("throw unauthorized khi refresh token không khớp DB", async () => {
    const user = makeFakeUser({ refreshToken: "other_token" });
    vi.mocked(jwt.verify as any).mockReturnValue({ id: "user_id_123" });
    vi.mocked(authRepo.findByIdWithRefreshToken).mockResolvedValue(user as any);

    await expect(authService.refreshAccessToken("valid_refresh_token"))
      .rejects.toMatchObject({ status: 401 });
  });
});

// ── logout ────────────────────────────────────────────────────────────────────

describe("authService.logout", () => {
  it("xóa refresh token khỏi DB khi logout", async () => {
    const user = makeFakeUser({ refreshToken: "some_token" });
    vi.mocked(authRepo.findByIdWithRefreshToken).mockResolvedValue(user as any);
    vi.mocked(authRepo.save).mockResolvedValue(undefined as any);

    await authService.logout("user_id_123");

    expect(user.refreshToken).toBeUndefined();
    expect(authRepo.save).toHaveBeenCalledWith(user);
  });
});
