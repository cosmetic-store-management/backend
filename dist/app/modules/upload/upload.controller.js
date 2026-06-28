import { Router } from "express";
import { authenticate, isStaff } from "../../middlewares/auth.middleware.js";
import { catchAsync } from "../../shared/helpers/catchAsync.js";
import * as response from "../../shared/helpers/response.js";
import { badRequest } from "../../shared/errors/httpErrors.js";
import fs from "fs";
import { join } from "path";
// Use process.cwd() so it always resolves to backend/uploads whether running via tsx or node dist/
const rootDir = process.cwd();
const uploadsDir = join(rootDir, "uploads");
import multer from "multer";
const storage = multer.diskStorage({
    destination: function (_req, _file, cb) {
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }
        cb(null, uploadsDir);
    },
    filename: function (_req, file, cb) {
        const extMap = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/gif": "gif",
            "video/mp4": "mp4",
            "video/quicktime": "mov",
        };
        const extension = extMap[file.mimetype] || "bin";
        const filename = `media-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}.${extension}`;
        cb(null, filename);
    },
});
const upload = multer({
    storage,
    limits: {
        fileSize: 20 * 1024 * 1024, // 20 MB cho video
    },
    fileFilter: (_req, file, cb) => {
        const allowed = [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "video/mp4",
            "video/quicktime",
        ];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error(`Loại file không được hỗ trợ: ${file.mimetype}`));
        }
    },
});
const router = Router();
// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
// Whitelist MIME types (string check + magic bytes check)
const ALLOWED_MIMES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
]);
// Magic bytes (file signature) cho các loại ảnh hợp lệ
const MAGIC_BYTES = [
    { mime: "image/jpeg", checks: [{ bytes: [0xff, 0xd8, 0xff], offset: 0 }] },
    { mime: "image/png", checks: [{ bytes: [0x89, 0x50, 0x4e, 0x47], offset: 0 }] },
    { mime: "image/webp", checks: [{ bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, { bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 }] }, // RIFF....WEBP
    { mime: "image/gif", checks: [{ bytes: [0x47, 0x49, 0x46, 0x38], offset: 0 }] }, // GIF8
];
/**
 * Kiểm tra magic bytes của buffer để xác thực loại file thực sự khớp với MIME type.
 */
function validateMagicBytes(buffer, mimeType) {
    const config = MAGIC_BYTES.find((m) => m.mime === mimeType);
    if (!config)
        return false;
    return config.checks.every(({ bytes, offset }) => bytes.every((byte, i) => buffer[offset + i] === byte));
}
// ── POST /api/upload ───────────────────────────────────────────────────────────
router.post("/", authenticate, isStaff, catchAsync(async (req, res) => {
    const { base64 } = req.body;
    if (!base64)
        throw badRequest("Thiếu dữ liệu hình ảnh (base64)");
    // Parse base64 data URI: "data:<mime>;base64,<data>"
    const matches = base64.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3)
        throw badRequest("Dữ liệu base64 không hợp lệ");
    const mimeType = matches[1].toLowerCase();
    const base64Data = matches[2];
    // [1] Kiểm tra MIME type trong whitelist
    if (!ALLOWED_MIMES.has(mimeType)) {
        throw badRequest(`Loại file không được hỗ trợ. Chỉ chấp nhận: ${[...ALLOWED_MIMES].join(", ")}`);
    }
    const buffer = Buffer.from(base64Data, "base64");
    // [2] Kiểm tra kích thước tối đa 5MB
    if (buffer.byteLength > MAX_FILE_SIZE_BYTES) {
        throw badRequest(`File quá lớn. Kích thước tối đa là ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`);
    }
    // [3] Validate magic bytes — kiểm tra nội dung thực của file khớp với MIME type
    if (!validateMagicBytes(buffer, mimeType)) {
        throw badRequest("Nội dung file không hợp lệ hoặc bị giả mạo định dạng");
    }
    // Generate safe filename (không dùng tên user-supplied)
    const extMap = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
    };
    const extension = extMap[mimeType] || "jpg";
    const filename = `img-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}.${extension}`;
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const filePath = join(uploadsDir, filename);
    await fs.promises.writeFile(filePath, buffer);
    const host = req.get("host") || process.env.BACKEND_HOST || "localhost:3001";
    const protocol = req.secure || req.headers["x-forwarded-proto"] === "https"
        ? "https"
        : "http";
    const url = `${protocol}://${host}/api/uploads/${filename}`;
    return response.created(res, {
        message: "Tải ảnh lên thành công",
        url,
    });
}));
// ── POST /api/upload/media ─────────────────────────────────────────────────────
// Cho phép cả Admin và Customer tải ảnh hoặc video (dùng cho Review)
router.post("/media", authenticate, (req, res, next) => {
    upload.single("file")(req, res, (err) => {
        if (err) {
            if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
                return res.status(400).json({ success: false, message: "File quá lớn. Kích thước tối đa là 20MB" });
            }
            return res.status(400).json({ success: false, message: err.message });
        }
        next();
    });
}, catchAsync(async (req, res) => {
    if (!req.file)
        throw badRequest("Không có file nào được tải lên");
    const host = req.get("host") || process.env.BACKEND_HOST || "localhost:3001";
    const protocol = req.secure || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    const url = `${protocol}://${host}/api/uploads/${req.file.filename}`;
    return response.created(res, {
        message: "Tải file lên thành công",
        url,
    });
}));
export default router;
