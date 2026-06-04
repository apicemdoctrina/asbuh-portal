import fs from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { UPLOADS_DIR } from "./upload.js";
import { parseStatement } from "./statement-parser.js";
import type { ParsedStatement } from "./statement-types.js";

export function readOriginal(filename: string): { buf: Buffer; fullPath: string } {
  const fullPath = path.join(UPLOADS_DIR, filename);
  return { buf: fs.readFileSync(fullPath), fullPath };
}

/** Источник правды: правленые данные (editedData), иначе парсинг оригинала. */
export function loadParsed(item: {
  editedData: Prisma.JsonValue;
  originalPath: string;
}): ParsedStatement {
  if (item.editedData) return item.editedData as unknown as ParsedStatement;
  return parseStatement(readOriginal(item.originalPath).buf);
}
