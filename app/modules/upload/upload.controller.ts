import { Router } from "express";
import { authenticate, isStaff } from "../../middlewares/auth.middleware.js";
import { catchAsync } from "../../shared/helpers/catchAsync.js";
import * as response from "../../shared/helpers/response.js";
import { badRequest } from "../../shared/errors/httpErrors.js";
import multer from "multer";
import * as uploadService from "./upload.service.js";

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15 MB cho video để vừa giới hạn 16MB của MongoDB
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
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

const router = Router();

// ── GET /api/uploads/:filename ──────────────────────────────────────────────────
// Serve file trực tiếp từ MongoDB
router.get(
  "/:filename",
  catchAsync(async (req, res) => {
    const filename = req.params.filename as string;
    const file = await uploadService.getFile(filename);

    if (!file) {
      return res.status(404).send("File not found");
    }

    // Cache file on client side for 30 days
    res.setHeader("Cache-Control", "public, max-age=2592000");
    res.setHeader("Content-Type", file.mimeType);
    res.send(file.data);
  }),
);

// ── POST /api/upload ───────────────────────────────────────────────────────────
router.post(
  "/",
  authenticate,
  isStaff,
  catchAsync(async (req, res) => {
    const { base64 } = req.body;
    if (!base64) throw badRequest("Missing image data (base64)");

    const host =
      req.get("host") || process.env.BACKEND_HOST || "localhost:3001";
    const protocol =
      req.secure || req.headers["x-forwarded-proto"] === "https"
        ? "https"
        : "http";

    const url = await uploadService.uploadBase64(base64, host, protocol);

    return response.created(res, {
      message: "Image uploaded successfully",
      url,
    });
  }),
);

// ── POST /api/upload/media ─────────────────────────────────────────────────────
// Cho phép cả Admin và Customer tải ảnh hoặc video
router.post(
  "/media",
  authenticate,
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        if (
          err instanceof multer.MulterError &&
          err.code === "LIMIT_FILE_SIZE"
        ) {
          return res.status(400).json({
            success: false,
            message: "File is too large. Maximum size is 15MB",
          });
        }
        return res.status(400).json({ success: false, message: err.message });
      }
      next();
    });
  },
  catchAsync(async (req, res) => {
    if (!req.file) throw badRequest("No file was uploaded");

    const host =
      req.get("host") || process.env.BACKEND_HOST || "localhost:3001";
    const protocol =
      req.secure || req.headers["x-forwarded-proto"] === "https"
        ? "https"
        : "http";

    const url = await uploadService.uploadBuffer(
      req.file.buffer,
      req.file.mimetype,
      host,
      protocol,
    );

    return response.created(res, {
      message: "File uploaded successfully",
      url,
    });
  }),
);

export default router;
