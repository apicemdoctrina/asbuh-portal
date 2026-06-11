import type { Request } from "express";
import type { Prisma } from "@prisma/client";
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
  // Явный unchecked-input: userId nullable FK, details — JSON-колонка
  const data: Prisma.AuditLogUncheckedCreateInput = {
    action: entry.action,
    userId: entry.userId ?? null,
    entity: entry.entity,
    entityId: entry.entityId,
    details: (entry.details ?? undefined) as Prisma.InputJsonValue | undefined,
    ipAddress: entry.ipAddress,
    userAgent: entry.userAgent,
  };
  return prisma.auditLog.create({ data });
}

/** Convenience: extracts ipAddress and userAgent from Express request automatically */
export function auditFromReq(req: Request, entry: Omit<AuditEntry, "ipAddress" | "userAgent">) {
  return logAudit({
    ...entry,
    ipAddress: req.ip,
    userAgent: (req.headers["user-agent"] as string | undefined) ?? undefined,
  });
}
