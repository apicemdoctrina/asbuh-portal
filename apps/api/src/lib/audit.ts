import prisma from "./prisma.js";

interface AuditEntry {
  userId?: string;
  action: string;
  entity?: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

export async function logAudit(entry: AuditEntry) {
  return prisma.auditLog.create({ data: entry });
}
