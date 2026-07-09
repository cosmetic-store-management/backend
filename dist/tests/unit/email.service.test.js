/**
 * email.service.test.ts — Unit tests cho Email Service
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
// Mock `nodemailer` module
const sendMailMock = vi.fn();
vi.mock("nodemailer", () => {
    return {
        default: {
            createTransport: vi.fn(() => ({
                sendMail: sendMailMock,
            })),
        },
    };
});
import * as emailService from "../../app/shared/email/email.service.js";
beforeEach(() => {
    vi.clearAllMocks();
    process.env.SMTP_USER = "test@gmail.com";
    process.env.SMTP_PASS = "test-pass";
});
describe("emailService.sendResetPasswordEmail", () => {
    it("gọi Nodemailer thành công để gửi email reset password", async () => {
        sendMailMock.mockResolvedValue({ messageId: "email_id" });
        await emailService.sendResetPasswordEmail("user@example.com", "token123");
        expect(sendMailMock).toHaveBeenCalledTimes(1);
        const callArg = sendMailMock.mock.calls[0][0];
        expect(callArg.to).toBe("user@example.com");
        expect(callArg.subject).toContain("Reset your password");
        expect(callArg.html).toContain("token123");
    });
});
describe("emailService.sendOrderSuccessEmail", () => {
    it("gọi Nodemailer để gửi email đơn hàng thành công", async () => {
        sendMailMock.mockResolvedValue({ messageId: "email_id" });
        await emailService.sendOrderSuccessEmail("customer@test.com", "ORD123", 500000);
        expect(sendMailMock).toHaveBeenCalledTimes(1);
        const callArg = sendMailMock.mock.calls[0][0];
        expect(callArg.to).toBe("customer@test.com");
        expect(callArg.subject).toContain("ORD123");
        expect(callArg.html).toContain("500,000 ₫"); // formatted total
    });
});
describe("emailService.sendEmailWithRetry (internal test thông qua exported fn)", () => {
    it("thử lại tối đa 3 lần nếu Nodemailer bị lỗi", async () => {
        // Override maxRetries bằng cách mock lỗi liên tục
        sendMailMock.mockRejectedValue(new Error("API Error"));
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => { });
        // Gọi 1 hàm gửi email bất kỳ để trigger retry logic bên trong
        await emailService.sendOrderCancelledEmail("test@test.com", "ORD-FAIL");
        // Phải thử đúng 3 lần (attempt = 1, 2, 3)
        expect(sendMailMock).toHaveBeenCalledTimes(3);
        expect(consoleErrorSpy).toHaveBeenCalled();
        consoleErrorSpy.mockRestore();
    });
    it("ngừng thử lại nếu lần thứ 2 thành công", async () => {
        sendMailMock
            .mockRejectedValueOnce(new Error("Lỗi mạng lần 1"))
            .mockResolvedValueOnce({ messageId: "ok" });
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => { });
        await emailService.sendOrderShippedEmail("test@test.com", "ORD-SHIP", "TRACK99");
        expect(sendMailMock).toHaveBeenCalledTimes(2);
        consoleErrorSpy.mockRestore();
    });
});
describe("SMTP Config Handling", () => {
    it("không gửi email nếu thiếu SMTP_USER", async () => {
        const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
        delete process.env.SMTP_USER;
        vi.resetModules();
        const freshEmailService = await import("../../app/shared/email/email.service.js");
        await freshEmailService.sendOrderSuccessEmail("test@test.com", "ORD", 100);
        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("SMTP_USER or SMTP_PASS is not configured — email will not be sent."));
        consoleWarnSpy.mockRestore();
    });
});
