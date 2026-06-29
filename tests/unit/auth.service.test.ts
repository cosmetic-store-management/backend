/**
 * auth.service.test.ts — Unit tests cho Auth Service
 * Strategy: Mock toàn bộ authRepo và external dependencies để test business logic thuần túy.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies trước khi import service
vi.mock("../../app/modules/auth/auth.repository.js");
vi.mock("../../app/modules/user/dto/user.response.dto.js", () => ({
  mapUser: (user: any) => ({
    id: user._id?.toString() ?? "uid",
    name: user.name,
    role: user.role,
  }),
}));
vi.mock("../../app/shared/email/email.service.js", () => ({
  sendResetPasswordEmail: vi.fn().mockResolvedValue(undefined),
  sendOtpVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed_password"),
    compare: vi.fn(),
  },
}));
vi.mock("jsonwebtoken", () => ({
  default: {
    sign: vi.fn().mockReturnValue("mock_token"),
    verify: vi.fn(),
  },
}));

import * as authRepo from "../../app/modules/auth/auth.repository.js";
import * as authService from "../../app/modules/auth/auth.service.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// Helper để tạo fake user document
const makeFakeUser = (overrides: Record<string, any> = {}) => ({
  _id: { toString: () => "user_id_123" },
  name: "Nguyễn Văn A",
  phone: "0901234567",
  email: "test@example.com",
  password: "hashed_password",
  role: "customer",
  isActive: true,
  points: 0,
  refreshTokens: [],
  save: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = "test_secret";
  process.env.JWT_REFRESH_SECRET = "test_refresh_secret";
});

// ── register ──────────────────────────────────────────────────────────────────

describe("authService.register", () => {
  it("tạo user mới thành công khi phone chưa tồn tại", async () => {
    const fakeUser = makeFakeUser();
    vi.mocked(authRepo.findOtpByEmail).mockResolvedValue({ isVerified: true } as any);
    vi.mocked(authRepo.deleteOtp).mockResolvedValue({} as any);
    vi.mocked(authRepo.findByPhone).mockResolvedValue(null);
    vi.mocked(authRepo.findByEmail).mockResolvedValue(null);
    vi.mocked(authRepo.create).mockResolvedValue(fakeUser as any);
    vi.mocked(authRepo.save).mockResolvedValue(undefined as any);

    const result = await authService.register({
      name: "Nguyễn Văn A",
      phone: "0901234567",
      email: "test@example.com",
      password: "password123",
    });

    expect(result.accessToken).toBe("mock_token");
    expect(result.refreshToken).toBe("mock_token");
    expect(authRepo.create).toHaveBeenCalledOnce();
  });

  it("throw conflict khi phone đã tồn tại và có password", async () => {
    const existingUser = makeFakeUser({ password: "hashed" });
    vi.mocked(authRepo.findOtpByEmail).mockResolvedValue({ isVerified: true } as any);
    vi.mocked(authRepo.findByPhone).mockResolvedValue(existingUser as any);

    await expect(
      authService.register({
        name: "Test",
        phone: "0901234567",
        email: "t@example.com",
        password: "pass123",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("throw conflict khi email đã tồn tại ở user khác", async () => {
    vi.mocked(authRepo.findOtpByEmail).mockResolvedValue({ isVerified: true } as any);
    vi.mocked(authRepo.findByPhone).mockResolvedValue(null);
    vi.mocked(authRepo.findByEmail).mockResolvedValue(
      makeFakeUser({ _id: { toString: () => "other_id" } }) as any,
    );

    await expect(
      authService.register({
        name: "Test",
        phone: "0901111111",
        email: "dupe@example.com",
        password: "pass123",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("giới hạn tối đa 5 refreshTokens cho mỗi user", async () => {
    const fakeUser = makeFakeUser({ refreshTokens: ["1", "2", "3", "4", "5"] });
    vi.mocked(authRepo.findByPhone).mockResolvedValue(null);
    vi.mocked(authRepo.findByEmail).mockResolvedValue(null);
    vi.mocked(authRepo.create).mockResolvedValue(fakeUser as any);
    vi.mocked(authRepo.save).mockResolvedValue(undefined as any);

    await authService.register({
      name: "Nguyễn Văn A",
      phone: "0901234567",
      email: "test2@example.com",
      password: "password123",
    });

    expect(fakeUser.refreshTokens.length).toBe(5);
    expect(fakeUser.refreshTokens[4]).toBe("mock_token");
    expect((fakeUser.refreshTokens as any[]).includes("1")).toBe(false); // Token cũ nhất bị đẩy ra
  });
});

// ── sendOtp & verifyOtp ───────────────────────────────────────────────────────

describe("OTP Verification", () => {
  it("sendOtp sinh mã và lưu vào DB thành công", async () => {
    vi.mocked(authRepo.upsertOtp).mockResolvedValue({} as any);

    const result = await authService.sendOtp({ email: "test@example.com" });

    expect(authRepo.upsertOtp).toHaveBeenCalledWith(
      "test@example.com",
      expect.any(String),
      expect.any(Date)
    );
    expect(result.message).toContain("đã được gửi");
  });

  it("verifyOtp thành công khi mã đúng và còn hạn", async () => {
    vi.mocked(authRepo.findOtpByEmail).mockResolvedValue({
      otpCode: "123456",
      expiresAt: new Date(Date.now() + 100000), // Vẫn còn hạn
    } as any);
    vi.mocked(authRepo.markOtpVerified).mockResolvedValue({} as any);

    const result = await authService.verifyOtp({ email: "test@example.com", otpCode: "123456" });

    expect(authRepo.markOtpVerified).toHaveBeenCalledWith("test@example.com");
    expect(result.message).toContain("thành công");
  });

  it("verifyOtp thất bại khi mã sai", async () => {
    vi.mocked(authRepo.findOtpByEmail).mockResolvedValue({
      otpCode: "123456",
      expiresAt: new Date(Date.now() + 100000),
    } as any);

    await expect(
      authService.verifyOtp({ email: "test@example.com", otpCode: "000000" })
    ).rejects.toMatchObject({ status: 400 });
  });
});

// ── loginAdmin ────────────────────────────────────────────────────────────────

describe("authService.loginAdmin", () => {
  it("đăng nhập admin thành công với đúng credentials", async () => {
    const adminUser = makeFakeUser({ role: "owner" });
    vi.mocked(authRepo.findByEmail).mockResolvedValue(adminUser as any);
    vi.mocked(authRepo.findByIdWithRefreshToken).mockResolvedValue(
      adminUser as any,
    );
    vi.mocked(bcrypt.compare as any).mockResolvedValue(true);

    const result = await authService.login({
      email: "admin@example.com",
      password: "pass",
    });
    expect(result.user.role).toBe("owner");
    expect(result.accessToken).toBeTruthy();
  });

  it("throw unauthorized khi password sai", async () => {
    const adminUser = makeFakeUser({ role: "owner" });
    vi.mocked(authRepo.findByEmail).mockResolvedValue(adminUser as any);
    vi.mocked(bcrypt.compare as any).mockResolvedValue(false);

    await expect(
      authService.login({ email: "admin@example.com", password: "wrong" }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("throw unauthorized khi role là customer", async () => {
    const customerUser = makeFakeUser({ role: "customer" });
    vi.mocked(authRepo.findByEmail).mockResolvedValue(customerUser as any);
    vi.mocked(bcrypt.compare as any).mockResolvedValue(true);

    await expect(
      authService.login({ email: "c@example.com", password: "pass" }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("throw unauthorized khi tài khoản bị khóa (isActive = false)", async () => {
    const lockedUser = makeFakeUser({ role: "staff", isActive: false });
    vi.mocked(authRepo.findByEmail).mockResolvedValue(lockedUser as any);

    await expect(
      authService.login({ email: "locked@example.com", password: "pass" }),
    ).rejects.toMatchObject({ status: 401 });
  });
});

// ── loginPublic ───────────────────────────────────────────────────────────────

describe("authService.loginPublic", () => {
  it("đăng nhập customer thành công", async () => {
    const customer = makeFakeUser({ role: "customer" });
    vi.mocked(authRepo.findByPhone).mockResolvedValue(customer as any);
    vi.mocked(authRepo.findByIdWithRefreshToken).mockResolvedValue(
      customer as any,
    );
    vi.mocked(bcrypt.compare as any).mockResolvedValue(true);

    const result = await authService.login({
      phone: "0901234567",
      password: "pass",
    });
    expect(result.user.role).toBe("customer");
  });

  it("throw unauthorized khi tài khoản admin cố đăng nhập storefront", async () => {
    const adminUser = makeFakeUser({ role: "owner" });
    vi.mocked(authRepo.findByPhone).mockResolvedValue(adminUser as any);

    await expect(
      authService.login({ phone: "0901234567", password: "pass" }),
    ).rejects.toMatchObject({ status: 401 });
  });
});

// ── refreshAccessToken ────────────────────────────────────────────────────────

describe("authService.refreshAccessToken", () => {
  it("cấp token mới khi refresh token hợp lệ", async () => {
    const user = makeFakeUser({ refreshTokens: ["valid_refresh_token"] });
    vi.mocked(jwt.verify as any).mockReturnValue({ id: "user_id_123" });
    vi.mocked(authRepo.findByIdWithRefreshToken).mockResolvedValue(user as any);

    const result = await authService.refreshAccessToken("valid_refresh_token");
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
  });

  it("throw unauthorized khi JWT verify thất bại", async () => {
    vi.mocked(jwt.verify as any).mockImplementation(() => {
      throw new Error("expired");
    });

    await expect(
      authService.refreshAccessToken("bad_token"),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("throw unauthorized khi refresh token không khớp DB", async () => {
    const user = makeFakeUser({ refreshTokens: ["other_token"] });
    vi.mocked(jwt.verify as any).mockReturnValue({ id: "user_id_123" });
    vi.mocked(authRepo.findByIdWithRefreshToken).mockResolvedValue(user as any);

    await expect(
      authService.refreshAccessToken("valid_refresh_token"),
    ).rejects.toMatchObject({ status: 401 });
  });
});

// ── logout ────────────────────────────────────────────────────────────────────

describe("authService.logout", () => {
  it("xóa refresh token khỏi mảng khi logout 1 thiết bị cụ thể", async () => {
    const user = makeFakeUser({ refreshTokens: ["some_token", "keep_token"] });
    vi.mocked(authRepo.findByIdWithRefreshToken).mockResolvedValue(user as any);
    vi.mocked(authRepo.save).mockResolvedValue(undefined as any);

    await authService.logout("user_id_123", "some_token");

    expect(user.refreshTokens).not.toContain("some_token");
    expect(user.refreshTokens).toContain("keep_token");
    expect(authRepo.save).toHaveBeenCalledWith(user);
  });

  it("xóa tất cả refresh token khi logout không truyền token", async () => {
    const user = makeFakeUser({ refreshTokens: ["t1", "t2"] });
    vi.mocked(authRepo.findByIdWithRefreshToken).mockResolvedValue(user as any);
    vi.mocked(authRepo.save).mockResolvedValue(undefined as any);

    await authService.logout("user_id_123");

    expect(user.refreshTokens.length).toBe(0);
    expect(authRepo.save).toHaveBeenCalledWith(user);
  });
});
