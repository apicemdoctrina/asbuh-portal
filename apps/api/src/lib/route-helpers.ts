import type { Response } from "express";
import type { ZodError } from "zod";

/**
 * Parse pagination params from query string.
 * Defaults: page=1, limit=50, max limit=100.
 */
export function parsePagination(pageQ: unknown, limitQ: unknown, maxLimit = 100) {
  const page = Math.max(1, Number(pageQ) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number(limitQ) || 50));
  return { page, limit, skip: (page - 1) * limit };
}

/**
 * Check if a Prisma error is a unique constraint violation (P2002).
 */
export function isPrismaUniqueError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "P2002"
  );
}

/**
 * Send a standardized Zod validation error response.
 */
export function sendZodError(res: Response, error: ZodError, message = "Validation failed") {
  res
    .status(400)
    .json({ error: message, issues: error.issues, details: error.flatten().fieldErrors });
}
