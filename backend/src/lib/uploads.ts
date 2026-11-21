import multer from "multer";
import { badRequest } from "./errors.ts";
import { newVerificationObjectKey, objectStore, safeDeleteObject } from "./storage.ts";

export const MAX_VERIFICATION_DOCS = 3;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

/** Memory upload — bytes are written to the configured ObjectStore after validation. */
export const verificationUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(badRequest("Only JPEG, PNG, WebP, or PDF files are allowed", "invalid_file_type"));
      return;
    }
    cb(null, true);
  },
});

export async function storeVerificationFile(file: Express.Multer.File) {
  if (!file.buffer?.length) throw badRequest("Choose a file to upload", "file_required");
  const key = newVerificationObjectKey(file.mimetype);
  await objectStore.put(key, file.buffer, file.mimetype);
  return { key, backend: objectStore.name, size: file.buffer.length };
}

export { objectStore, safeDeleteObject };
