/**
 * setting.service.test.ts — Unit tests cho Setting Service
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("../../app/modules/setting/models/setting.schema.js", () => {
    return {
        default: {
            findOne: vi.fn(),
            create: vi.fn(),
        }
    };
});
import Setting from "../../app/modules/setting/models/setting.schema.js";
import * as settingService from "../../app/modules/setting/setting.service.js";
beforeEach(() => {
    vi.clearAllMocks();
});
describe("settingService.getSettings", () => {
    it("trả về settings cũ nếu đã tồn tại", async () => {
        const mockDoc = { value: { storeName: "GlowUp" } };
        vi.mocked(Setting.findOne).mockResolvedValue(mockDoc);
        const result = await settingService.getSettings();
        expect(result.storeName).toBe("GlowUp");
    });
    it("tạo mới và trả về default settings nếu chưa tồn tại", async () => {
        vi.mocked(Setting.findOne).mockResolvedValue(null);
        const createSpy = vi.mocked(Setting.create).mockResolvedValue({
            value: { storeName: "GlowUp Cosmetics" }
        });
        const result = await settingService.getSettings();
        expect(createSpy).toHaveBeenCalled();
        expect(result.storeName).toBe("GlowUp Cosmetics");
    });
});
describe("settingService.updateSettings", () => {
    it("tạo mới và merge data nếu settings chưa tồn tại", async () => {
        vi.mocked(Setting.findOne).mockResolvedValue(null);
        const createSpy = vi.mocked(Setting.create).mockResolvedValue({
            value: { storeName: "My Shop", profitMargin: 40 }
        });
        const result = await settingService.updateSettings({ storeName: "My Shop" });
        expect(createSpy).toHaveBeenCalled();
        // createSpy args: key, value, description. The value should be merged with DEFAULT_SETTINGS
        const callArgs = createSpy.mock.calls[0][0];
        expect(callArgs.value.storeName).toBe("My Shop");
        expect(result.profitMargin).toBe(40);
    });
    it("cập nhật và merge data nếu settings đã tồn tại", async () => {
        const mockSave = vi.fn().mockResolvedValue(true);
        const mockMarkModified = vi.fn();
        const mockDoc = {
            value: { storeName: "Old Shop", currency: "USD" },
            save: mockSave,
            markModified: mockMarkModified
        };
        vi.mocked(Setting.findOne).mockResolvedValue(mockDoc);
        const result = await settingService.updateSettings({ storeName: "New Shop" });
        expect(mockDoc.value.storeName).toBe("New Shop");
        expect(mockDoc.value.currency).toBe("USD"); // retained old value
        expect(mockMarkModified).toHaveBeenCalledWith("value");
        expect(mockSave).toHaveBeenCalled();
        expect(result.storeName).toBe("New Shop");
    });
});
