/**
 * user.service.test.ts — Unit tests cho User Service
 * Nhóm: profile, address book, admin (role/status/reset), points, favorites/recently-viewed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

// ── Mocks ──────────────────────────────────────────────────────────────────────
vi.mock("../../app/modules/user/user.repository.js");
vi.mock("../../app/modules/user/dto/user.response.dto.js", () => ({
  mapUser: (u: any) => ({
    id: u._id?.toString() ?? "uid",
    name: u.name,
    role: u.role,
    phone: u.phone,
    points: u.points ?? 0,
  }),
}));
vi.mock("../../app/models/order/order.schema.js", () => ({
  default: { aggregate: vi.fn() },
}));
vi.mock("../../app/models/user/point-history.schema.js", () => ({
  default: { create: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../../app/modules/product/product.repository.js", () => ({
  attachVariants: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../app/modules/product/dto/product.response.dto.js", () => ({
  mapProduct: (p: any) => p,
}));
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn().mockResolvedValue("hashed_pass") },
}));

import * as userRepo from "../../app/modules/user/user.repository.js";
import * as userService from "../../app/modules/user/user.service.js";
import PointHistory from "../../app/models/user/point-history.schema.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

const FAKE_ID = new mongoose.Types.ObjectId().toString();
const FAKE_ADDR_ID = new mongoose.Types.ObjectId().toString();

const makeUser = (overrides: Record<string, any> = {}): any => ({
  _id: { toString: () => FAKE_ID },
  name: "Nguyễn Test",
  phone: "0901234567",
  email: "test@example.com",
  role: "customer",
  isActive: true,
  points: 100,
  addresses: [],
  favorites: [],
  recentlyViewed: [],
  ...overrides,
});

const makeAdmin = (role: "owner" | "manager" | "staff" = "owner"): any =>
  makeUser({
    role,
    _id: { toString: () => new mongoose.Types.ObjectId().toString() },
  });

beforeEach(() => vi.clearAllMocks());

// ── Profile ───────────────────────────────────────────────────────────────────

describe("userService.updateCurrentUser", () => {
  it("cập nhật name thành công", async () => {
    const user = makeUser();
    vi.mocked(userRepo.findById).mockResolvedValue(user);
    await userService.updateCurrentUser(FAKE_ID, { name: "Tên Mới" });

    expect(user.name).toBe("Tên Mới");
    expect(userRepo.save).toHaveBeenCalledWith(user);
  });

  it("throw conflict khi phone mới thuộc tài khoản khác", async () => {
    const user = makeUser();
    const otherUser = makeUser({
      _id: { toString: () => new mongoose.Types.ObjectId().toString() },
    });
    vi.mocked(userRepo.findById).mockResolvedValue(user);
    vi.mocked(userRepo.findByPhone).mockResolvedValue(otherUser);

    await expect(
      userService.updateCurrentUser(FAKE_ID, { phone: "0999999999" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("throw notFound khi user không tồn tại", async () => {
    vi.mocked(userRepo.findById).mockResolvedValue(null);

    await expect(
      userService.updateCurrentUser(FAKE_ID, { name: "X" }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ── Address Book ──────────────────────────────────────────────────────────────

describe("userService.addAddress", () => {
  it("thêm địa chỉ đầu tiên tự động set isDefault=true", async () => {
    const user = makeUser({ addresses: [] });
    vi.mocked(userRepo.findById).mockResolvedValue(user);
    vi.mocked(userRepo.save).mockResolvedValue(undefined as any);

    await userService.addAddress(FAKE_ID, {
      province: "HCM",
      district: "Q1",
      ward: "P1",
      street: "123 Test",
      isDefault: false,
    });

    expect(user.addresses.length).toBe(1);
    expect(user.addresses[0].isDefault).toBe(true);
  });

  it("thêm địa chỉ isDefault=true thì reset địa chỉ cũ", async () => {
    const existingAddr = { _id: FAKE_ADDR_ID, province: "HN", isDefault: true };
    const user = makeUser({ addresses: [existingAddr] });
    vi.mocked(userRepo.findById).mockResolvedValue(user);
    vi.mocked(userRepo.save).mockResolvedValue(undefined as any);

    await userService.addAddress(FAKE_ID, {
      province: "HCM",
      district: "Q1",
      ward: "P1",
      street: "456",
      isDefault: true,
    });

    expect(existingAddr.isDefault).toBe(false);
    expect(user.addresses[user.addresses.length - 1].isDefault).toBe(true);
  });
});

describe("userService.deleteAddress", () => {
  it("xóa địa chỉ thành công", async () => {
    const addr = { _id: { toString: () => FAKE_ADDR_ID }, isDefault: false };
    const user = makeUser({ addresses: [addr] });
    vi.mocked(userRepo.findById).mockResolvedValue(user);
    vi.mocked(userRepo.save).mockResolvedValue(undefined as any);

    await userService.deleteAddress(FAKE_ID, FAKE_ADDR_ID);
    expect(user.addresses.length).toBe(0);
  });

  it("xóa địa chỉ mặc định → địa chỉ kế tiếp thành mặc định", async () => {
    const addr1 = { _id: { toString: () => FAKE_ADDR_ID }, isDefault: true };
    const addr2Id = new mongoose.Types.ObjectId().toString();
    const addr2 = { _id: { toString: () => addr2Id }, isDefault: false };
    const user = makeUser({ addresses: [addr1, addr2] });
    vi.mocked(userRepo.findById).mockResolvedValue(user);
    vi.mocked(userRepo.save).mockResolvedValue(undefined as any);

    await userService.deleteAddress(FAKE_ID, FAKE_ADDR_ID);
    expect(user.addresses[0].isDefault).toBe(true);
  });

  it("throw notFound khi địa chỉ không tồn tại", async () => {
    const user = makeUser({ addresses: [] });
    vi.mocked(userRepo.findById).mockResolvedValue(user);

    await expect(
      userService.deleteAddress(FAKE_ID, FAKE_ADDR_ID),
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ── Admin — Role & Status ─────────────────────────────────────────────────────

describe("userService.updateUserStatus", () => {
  it("khóa tài khoản staff thành công", async () => {
    const staff = makeUser({ role: "staff" });
    const owner = makeAdmin("owner");
    vi.mocked(userRepo.findById).mockResolvedValue(staff);
    vi.mocked(userRepo.save).mockResolvedValue(undefined as any);

    await userService.updateUserStatus(FAKE_ID, false, owner);
    expect(staff.isActive).toBe(false);
  });

  it("throw conflict khi cố khóa tài khoản owner", async () => {
    const owner = makeAdmin("owner");
    const requester = makeAdmin("manager");
    vi.mocked(userRepo.findById).mockResolvedValue(owner);

    await expect(
      userService.updateUserStatus(FAKE_ID, false, requester),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("manager không thể tác động lên owner (hierarchy check)", async () => {
    const ownerTarget = makeAdmin("owner");
    const managerRequester = makeAdmin("manager");
    vi.mocked(userRepo.findById).mockResolvedValue(ownerTarget);

    await expect(
      userService.updateUserStatus(FAKE_ID, false, managerRequester),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("userService.updateUserRole", () => {
  it("manager cố thăng lên manager → tự động ép về staff", async () => {
    const staff = makeUser({ role: "staff" });
    const manager = makeAdmin("manager");
    vi.mocked(userRepo.findById).mockResolvedValue(staff);
    vi.mocked(userRepo.save).mockResolvedValue(undefined as any);

    await userService.updateUserRole(FAKE_ID, "manager", [], manager);
    expect(staff.role).toBe("staff"); // bị ép về staff
  });

  it("owner có thể thăng staff lên manager", async () => {
    const staff = makeUser({ role: "staff" });
    const owner = makeAdmin("owner");
    vi.mocked(userRepo.findById).mockResolvedValue(staff);
    vi.mocked(userRepo.save).mockResolvedValue(undefined as any);

    await userService.updateUserRole(FAKE_ID, "manager", [], owner);
    expect(staff.role).toBe("manager");
  });

  it("throw conflict khi đổi role của owner", async () => {
    const owner = makeAdmin("owner");
    const requester = makeAdmin("owner");
    vi.mocked(userRepo.findById).mockResolvedValue(owner);

    await expect(
      userService.updateUserRole(FAKE_ID, "manager", [], requester),
    ).rejects.toMatchObject({ status: 409 });
  });
});

// ── Points ────────────────────────────────────────────────────────────────────

describe("userService.adjustUserPoints", () => {
  it("cộng điểm thành công và ghi PointHistory", async () => {
    const user = makeUser({ points: 100 });
    vi.mocked(userRepo.findById).mockResolvedValue(user);
    vi.mocked(userRepo.save).mockResolvedValue(undefined as any);

    await userService.adjustUserPoints(FAKE_ID, 50, "Thưởng", "admin_id");

    expect(user.points).toBe(150);
    expect(PointHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ pointsChanged: 50, reason: "Thưởng" }),
    );
  });

  it("trừ điểm thành công", async () => {
    const user = makeUser({ points: 100 });
    vi.mocked(userRepo.findById).mockResolvedValue(user);
    vi.mocked(userRepo.save).mockResolvedValue(undefined as any);

    await userService.adjustUserPoints(FAKE_ID, -30, "Sử dụng", "admin_id");
    expect(user.points).toBe(70);
  });

  it("throw conflict khi điểm âm", async () => {
    const user = makeUser({ points: 10 });
    vi.mocked(userRepo.findById).mockResolvedValue(user);

    await expect(
      userService.adjustUserPoints(FAKE_ID, -50, "Trừ", "admin_id"),
    ).rejects.toMatchObject({ status: 409 });
  });
});

// ── Favorites ─────────────────────────────────────────────────────────────────

describe("userService.toggleFavorite", () => {
  it("thêm product vào favorites khi chưa có", async () => {
    const prodId = new mongoose.Types.ObjectId().toString();
    const user = makeUser({ favorites: [] });
    vi.mocked(userRepo.findById).mockResolvedValue(user);
    vi.mocked(userRepo.save).mockResolvedValue(undefined as any);

    const result = await userService.toggleFavorite(FAKE_ID, prodId);
    expect(result.action).toBe("added");
    expect(user.favorites.length).toBe(1);
  });

  it("xóa product khỏi favorites khi đã có", async () => {
    const prodId = new mongoose.Types.ObjectId();
    const user = makeUser({ favorites: [prodId] });
    vi.mocked(userRepo.findById).mockResolvedValue(user);
    vi.mocked(userRepo.save).mockResolvedValue(undefined as any);

    const result = await userService.toggleFavorite(FAKE_ID, prodId.toString());
    expect(result.action).toBe("removed");
    expect(user.favorites.length).toBe(0);
  });
});

// ── Recently Viewed ───────────────────────────────────────────────────────────

describe("userService.recordRecentlyViewed", () => {
  it("thêm product vào đầu list", async () => {
    const prodId = new mongoose.Types.ObjectId();
    const user = makeUser({ recentlyViewed: [] });
    vi.mocked(userRepo.findById).mockResolvedValue(user);
    vi.mocked(userRepo.save).mockResolvedValue(undefined as any);

    await userService.recordRecentlyViewed(FAKE_ID, prodId.toString());
    expect(user.recentlyViewed[0].toString()).toBe(prodId.toString());
  });

  it("move to front nếu đã có trong list", async () => {
    const prod1 = new mongoose.Types.ObjectId();
    const prod2 = new mongoose.Types.ObjectId();
    const user = makeUser({ recentlyViewed: [prod1, prod2] });
    vi.mocked(userRepo.findById).mockResolvedValue(user);
    vi.mocked(userRepo.save).mockResolvedValue(undefined as any);

    await userService.recordRecentlyViewed(FAKE_ID, prod2.toString());
    // prod2 phải lên đầu
    expect(user.recentlyViewed[0].toString()).toBe(prod2.toString());
    expect(user.recentlyViewed.length).toBe(2); // không bị duplicate
  });

  it("giới hạn 20 items — loại bỏ item cũ nhất", async () => {
    const items = Array.from(
      { length: 20 },
      () => new mongoose.Types.ObjectId(),
    );
    const user = makeUser({ recentlyViewed: [...items] });
    vi.mocked(userRepo.findById).mockResolvedValue(user);
    vi.mocked(userRepo.save).mockResolvedValue(undefined as any);

    const newProd = new mongoose.Types.ObjectId();
    await userService.recordRecentlyViewed(FAKE_ID, newProd.toString());
    expect(user.recentlyViewed.length).toBe(20); // vẫn 20
    expect(user.recentlyViewed[0].toString()).toBe(newProd.toString()); // mới nhất ở đầu
  });
});

describe("userService.clearRecentlyViewed", () => {
  it("xóa sạch danh sách đã xem", async () => {
    const user = makeUser({ recentlyViewed: [new mongoose.Types.ObjectId()] });
    vi.mocked(userRepo.findById).mockResolvedValue(user);
    vi.mocked(userRepo.save).mockResolvedValue(undefined as any);

    const result = await userService.clearRecentlyViewed(FAKE_ID);
    expect(user.recentlyViewed.length).toBe(0);
    expect(result.success).toBe(true);
  });
});
