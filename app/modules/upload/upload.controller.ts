import { Router } from "express";
import { authenticate, isStaff } from "../../middlewares/auth.middleware.js";
import { catchAsync } from "../../shared/helpers/catchAsync.js";
import * as response from "../../shared/helpers/response.js";
import { badRequest } from "../../shared/errors/httpErrors.js";
import fs from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// app/modules/upload -> app/modules -> app -> project root
const rootDir    = join(__dirname, "../../../");
const uploadsDir = join(rootDir, "uploads");

const router = Router();

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

// Whitelist MIME types (string check + magic bytes check)
const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// Magic bytes (file signature) cho các loại ảnh hợp lệ
const MAGIC_BYTES: Array<{ mime: string; bytes: number[]; offset?: number }> = [
  { mime: "image/jpeg", bytes: [0xFF, 0xD8, 0xFF] },
  { mime: "image/png",  bytes: [0x89, 0x50, 0x4E, 0x47] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // RIFF....WEBP
  { mime: "image/gif",  bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF8
];

/**
 * Kiểm tra magic bytes của buffer để xác thực loại file thực sự.
 * Ngăn chặn attacker đổi tên file nguy hiểm thành .jpg rồi upload.
 */
function validateMagicBytes(buffer: Buffer): boolean {
  return MAGIC_BYTES.some(({ bytes, offset = 0 }) =>
    bytes.every((byte, i) => buffer[offset + i] === byte)
  );
}

// ── POST /api/upload ───────────────────────────────────────────────────────────
router.post("/", authenticate, isStaff, catchAsync(async (req, res) => {
  const { base64 } = req.body;
  if (!base64) throw badRequest("Thiếu dữ liệu hình ảnh (base64)");

  // Parse base64 data URI: "data:<mime>;base64,<data>"
  const matches = base64.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) throw badRequest("Dữ liệu base64 không hợp lệ");

  const mimeType   = matches[1].toLowerCase();
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

  // [3] Validate magic bytes — kiểm tra nội dung thực của file
  if (!validateMagicBytes(buffer)) {
    throw badRequest("Nội dung file không hợp lệ hoặc bị giả mạo định dạng");
  }

  // Generate safe filename (không dùng tên user-supplied)
  const extMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png":  "png",
    "image/webp": "webp",
    "image/gif":  "gif",
  };
  const extension = extMap[mimeType] || "jpg";
  const filename   = `img-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}.${extension}`;

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const filePath = join(uploadsDir, filename);
  await fs.promises.writeFile(filePath, buffer);

  const host     = req.get("host") || process.env.BACKEND_HOST || "localhost:3001";
  const protocol = req.secure || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  const url      = `${protocol}://${host}/api/uploads/${filename}`;

  return response.created(res, {
    message: "Tải ảnh lên thành công",
    url,
  });
}));

export default router;
