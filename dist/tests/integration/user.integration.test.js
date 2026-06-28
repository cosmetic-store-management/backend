/**
 * user.integration.test.ts — Integration tests cho User Service + Repository
 * Dùng mongodb-memory-server: test Service + Repository + DB thật in-memory.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { connectTestDB, disconnectTestDB, clearCollections, } from "./helpers/db-helper.js";
import * as userService from "../../app/modules/user/user.service.js";
import User from "../../app/models/user/user.schema.js";
import PointHistory from "../../app/models/user/point-history.schema.js";
import mongoose from "mongoose";
beforeAll(async () => {
    await connectTestDB();
});
afterAll(async () => {
    await disconnectTestDB();
});
beforeEach(async () => {
    await clearCollections();
});
// ── Helpers ───────────────────────────────────────────────────────────────────
const createCustomer = (overrides = {}) => User.create({
    name: "Khách Test",
    phone: "0900000001",
    role: "customer",
    isActive: true,
    points: 100,
    ...overrides,
});
const createOwner = () => User.create({
    name: "Owner",
    phone: "0999999999",
    role: "owner",
    isActive: true,
    points: 0,
});
const createStaffUser = (phone = "0911111111") => User.create({
    name: "Staff Test",
    phone,
    role: "staff",
    isActive: true,
    points: 0,
});
// ── Profile ───────────────────────────────────────────────────────────────────
describe("[Integration] User — updateCurrentUser", () => {
    it("cập nhật tên user và lưu vào DB", async () => {
        const customer = await createCustomer();
        const result = await userService.updateCurrentUser(customer._id.toString(), { name: "Tên Mới" });
        expect(result.name).toBe("Tên Mới");
        const inDB = await User.findById(customer._id);
        expect(inDB?.name).toBe("Tên Mới");
    });
    it("throw conflict khi đổi phone sang phone của tài khoản khác", async () => {
        const customer = await createCustomer({ phone: "0900000001" });
        await createCustomer({ phone: "0900000002" });
        await expect(userService.updateCurrentUser(customer._id.toString(), {
            phone: "0900000002",
        })).rejects.toMatchObject({ status: 409 });
    });
    it("throw notFound khi userId không tồn tại", async () => {
        const fakeId = new mongoose.Types.ObjectId().toString();
        await expect(userService.updateCurrentUser(fakeId, { name: "X" })).rejects.toMatchObject({ status: 404 });
    });
});
// ── Address Book ──────────────────────────────────────────────────────────────
describe("[Integration] User — Address Book", () => {
    it("thêm địa chỉ đầu tiên → tự động isDefault=true", async () => {
        const customer = await createCustomer();
        await userService.addAddress(customer._id.toString(), {
            province: "Hà Nội",
            district: "Hoàn Kiếm",
            ward: "Lý Thái Tổ",
            street: "1 Đinh Tiên Hoàng",
            isDefault: false,
        });
        const inDB = await User.findById(customer._id);
        expect(inDB?.addresses.length).toBe(1);
        expect(inDB?.addresses[0].isDefault).toBe(true);
    });
    it("thêm địa chỉ isDefault → reset địa chỉ cũ", async () => {
        const customer = await createCustomer();
        const userId = customer._id.toString();
        // Thêm địa chỉ đầu tiên (mặc định)
        await userService.addAddress(userId, {
            province: "Hà Nội",
            district: "Hoàn Kiếm",
            ward: "Lý Thái Tổ",
            street: "1 Đinh Tiên Hoàng",
            isDefault: false,
        });
        // Thêm địa chỉ mới và đặt làm mặc định
        await userService.addAddress(userId, {
            province: "TP. HCM",
            district: "Q3",
            ward: "P.Võ Thị Sáu",
            street: "10 Nam Kỳ Khởi Nghĩa",
            isDefault: true,
        });
        const inDB = await User.findById(customer._id);
        expect(inDB?.addresses.length).toBe(2);
        const defaults = inDB?.addresses.filter((a) => a.isDefault);
        expect(defaults?.length).toBe(1); // chỉ 1 địa chỉ mặc định
        expect(defaults?.[0].province).toBe("TP. HCM");
    });
    it("xóa địa chỉ mặc định → địa chỉ tiếp theo thành mặc định", async () => {
        const customer = await createCustomer();
        const userId = customer._id.toString();
        await userService.addAddress(userId, {
            province: "HN",
            district: "HK",
            ward: "LTT",
            street: "1A",
            isDefault: false,
        });
        await userService.addAddress(userId, {
            province: "HCM",
            district: "Q1",
            ward: "BN",
            street: "2B",
            isDefault: false,
        });
        const userAfterAdd = await User.findById(customer._id);
        const defaultAddr = userAfterAdd?.addresses.find((a) => a.isDefault);
        const addrId = defaultAddr?._id?.toString();
        await userService.deleteAddress(userId, addrId);
        const inDB = await User.findById(customer._id);
        expect(inDB?.addresses.length).toBe(1);
        expect(inDB?.addresses[0].isDefault).toBe(true);
    });
});
// ── Admin — User Management ───────────────────────────────────────────────────
describe("[Integration] User — Admin updateUserStatus", () => {
    it("owner khóa tài khoản staff thành công", async () => {
        const staff = await createStaffUser();
        const owner = (await createOwner());
        await userService.updateUserStatus(staff._id.toString(), false, owner);
        const inDB = await User.findById(staff._id);
        expect(inDB?.isActive).toBe(false);
    });
    it("throw conflict khi cố khóa owner", async () => {
        const owner = (await createOwner());
        const requester = { ...owner.toObject(), role: "manager" };
        await expect(userService.updateUserStatus(owner._id.toString(), false, requester)).rejects.toMatchObject({ status: 409 });
    });
});
describe("[Integration] User — createStaff", () => {
    it("owner tạo manager thành công", async () => {
        const owner = (await createOwner());
        const result = await userService.createStaff({
            name: "Manager A",
            phone: "0922222222",
            role: "manager",
            password: "Pass@123",
        }, owner);
        expect(result.role).toBe("manager");
        const inDB = await User.findOne({ phone: "0922222222" });
        expect(inDB).not.toBeNull();
        expect(inDB?.password).not.toBe("Pass@123"); // đã hash
    });
    it("manager tạo staff nhưng không thể tạo manager (bị ép về staff)", async () => {
        const manager = (await User.create({
            name: "Mgr",
            phone: "0933333333",
            role: "manager",
            isActive: true,
        }));
        const result = await userService.createStaff({
            name: "New User",
            phone: "0944444444",
            role: "manager",
            password: "Pass@123",
        }, manager);
        expect(result.role).toBe("staff"); // bị ép về staff
    });
    it("throw conflict khi phone đã tồn tại", async () => {
        const owner = (await createOwner());
        await createStaffUser("0955555555");
        await expect(userService.createStaff({
            name: "Duplicate",
            phone: "0955555555",
            role: "staff",
            password: "Pass@123",
        }, owner)).rejects.toMatchObject({ status: 409 });
    });
});
// ── Points ────────────────────────────────────────────────────────────────────
describe("[Integration] User — adjustUserPoints", () => {
    it("cộng điểm và ghi PointHistory vào DB", async () => {
        const customer = await createCustomer({ points: 200 });
        const operatorId = new mongoose.Types.ObjectId().toString();
        await userService.adjustUserPoints(customer._id.toString(), 100, "Thưởng sinh nhật", operatorId);
        const inDB = await User.findById(customer._id);
        expect(inDB?.points).toBe(300);
        const history = await PointHistory.findOne({ userId: customer._id });
        expect(history?.pointsChanged).toBe(100);
        expect(history?.reason).toBe("Thưởng sinh nhật");
    });
    it("trừ điểm thành công", async () => {
        const customer = await createCustomer({ points: 200 });
        const operatorId = new mongoose.Types.ObjectId().toString();
        await userService.adjustUserPoints(customer._id.toString(), -50, "Đổi quà", operatorId);
        const inDB = await User.findById(customer._id);
        expect(inDB?.points).toBe(150);
    });
    it("throw conflict khi điểm kết quả < 0", async () => {
        const customer = await createCustomer({ points: 10 });
        const operatorId = new mongoose.Types.ObjectId().toString();
        await expect(userService.adjustUserPoints(customer._id.toString(), -100, "Trừ điểm", operatorId)).rejects.toMatchObject({ status: 409 });
        // Điểm trong DB phải không thay đổi
        const inDB = await User.findById(customer._id);
        expect(inDB?.points).toBe(10);
    });
});
// ── getUserById ───────────────────────────────────────────────────────────────
describe("[Integration] User — getUserById", () => {
    it("trả về user đúng theo id", async () => {
        const customer = await createCustomer();
        const result = await userService.getUserById(customer._id.toString());
        expect(result.id).toBe(customer._id.toString());
    });
    it("throw notFound khi id không tồn tại", async () => {
        const fakeId = new mongoose.Types.ObjectId().toString();
        await expect(userService.getUserById(fakeId)).rejects.toMatchObject({
            status: 404,
        });
    });
});
