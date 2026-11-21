import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";
import { badRequest } from "./errors.ts";

export const MAX_VERIFICATION_DOCS = 3;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

const root = process.env.UPLOAD_DIR
  ? process.env.UPLOAD_DIR
  : join(process.cwd(), "uploads");

export const verificationUploadDir = join(root, "verification");

mkdirSync(verificationUploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, verificationUploadDir),
  filename: (_req, file, cb) => {
    const ext =
      file.mimetype === "application/pdf"
        ? ".pdf"
        : file.mimetype === "image/png"
          ? ".png"
          : file.mimetype === "image/webp"
            ? ".webp"
            : ".jpg";
    cb(null, `${randomUUID()}${ext}`);
  },
});

export const verificationUpload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(badRequest("Only JPEG, PNG, WebP, or PDF files are allowed", "invalid_file_type"));
      return;
    }
    cb(null, true);
  },
});

export function absoluteStoredPath(storedName: string) {
  return join(verificationUploadDir, storedName);
}
