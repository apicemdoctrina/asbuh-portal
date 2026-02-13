import multer from "multer";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.resolve(__dirname, "../../uploads");

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "text/plain",
  "text/csv",
]);

const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".jpg",
  ".jpeg",
  ".png",
  ".txt",
  ".csv",
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ALLOWED_EXTENSIONS.has(ext) ? ext : "";
    cb(null, `${crypto.randomUUID()}${safeExt}`);
  },
});

function fileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) {
  if (ALLOWED_MIMES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "file"));
  }
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

export { UPLOADS_DIR };
