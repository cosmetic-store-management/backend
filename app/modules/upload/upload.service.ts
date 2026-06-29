import { badRequest } from "../../shared/errors/httpErrors.js";
import * as uploadRepo from "./upload.repository.js";

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_VIDEO_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB (to stay under MongoDB 16MB limit)

// Whitelist MIME types (string check + magic bytes check)
const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
]);

// Magic bytes (file signature) cho các loại ảnh hợp lệ
const MAGIC_BYTES: Array<{
  mime: string;
  checks: Array<{ bytes: number[]; offset: number }>;
}> = [
  { mime: "image/jpeg", checks: [{ bytes: [0xff, 0xd8, 0xff], offset: 0 }] },
  { mime: "image/png", checks: [{ bytes: [0x89, 0x50, 0x4e, 0x47], offset: 0 }] },
  {
    mime: "image/webp",
    checks: [
      { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 },
      { bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 },
    ],
  }, // RIFF....WEBP
  { mime: "image/gif", checks: [{ bytes: [0x47, 0x49, 0x46, 0x38], offset: 0 }] }, // GIF8
  // Note: MP4 and MOV magic bytes are complex, so we might skip magic byte checks for videos
  // or just rely on multer's mimetype for video files.
];

/**
 * Kiểm tra magic bytes của buffer để xác thực loại file thực sự khớp với MIME type.
 * Bỏ qua kiểm tra magic bytes đối với video.
 */
function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (mimeType.startsWith("video/")) return true; // Bỏ qua magic bytes cho video

  const config = MAGIC_BYTES.find((m) => m.mime === mimeType);
  if (!config) return false;
  return config.checks.every(({ bytes, offset }) =>
    bytes.every((byte, i) => buffer[offset + i] === byte),
  );
}

const getExtension = (mimeType: string) => {
  const extMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
  };
  return extMap[mimeType] || "bin";
};

export const uploadBuffer = async (
  buffer: Buffer,
  mimeType: string,
  host: string,
  protocol: string,
) => {
  if (!ALLOWED_MIMES.has(mimeType)) {
    throw badRequest(
      `Loại file không được hỗ trợ. Chỉ chấp nhận: ${[...ALLOWED_MIMES].join(", ")}`,
    );
  }

  const isVideo = mimeType.startsWith("video/");
  const maxSize = isVideo ? MAX_VIDEO_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES;

  if (buffer.byteLength > maxSize) {
    throw badRequest(
      `File quá lớn. Kích thước tối đa là ${maxSize / 1024 / 1024}MB`,
    );
  }

  if (!validateMagicBytes(buffer, mimeType)) {
    throw badRequest("Nội dung file không hợp lệ hoặc bị giả mạo định dạng");
  }

  const extension = getExtension(mimeType);
  const prefix = isVideo ? "vid" : "img";
  const filename = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}.${extension}`;

  await uploadRepo.saveFile(filename, mimeType, buffer.byteLength, buffer);

  const url = `${protocol}://${host}/api/uploads/${filename}`;
  return url;
};

export const uploadBase64 = async (
  base64: string,
  host: string,
  protocol: string,
) => {
  const matches = base64.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw badRequest("Dữ liệu base64 không hợp lệ");
  }

  const mimeType = matches[1].toLowerCase();
  const base64Data = matches[2];
  const buffer = Buffer.from(base64Data, "base64");

  return await uploadBuffer(buffer, mimeType, host, protocol);
};

export const getFile = async (filename: string) => {
  return await uploadRepo.getFileByFilename(filename);
};
