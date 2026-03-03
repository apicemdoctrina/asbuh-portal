import type { Request } from "express";
import prisma from "./prisma.js";

interface AuditEntry {
  userId?: string;
  action: string;
  entity?: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function logAudit(entry: AuditEntry) {
  return prisma.auditLog.create({ data: entry });
}

/** Convenience: extracts ipAddress and userAgent from Express request automatically */
export function auditFromReq(req: Request, entry: Omit<AuditEntry, "ipAddress" | "userAgent">) {
  return logAudit({
    ...entry,
    ipAddress: req.ip,
    userAgent: (req.headers["user-agent"] as string | undefined) ?? undefined,
  });
}
