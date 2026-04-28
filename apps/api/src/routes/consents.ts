import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";
import { logAudit } from "../lib/audit.js";
import {
  CURRENT_VERSIONS,
  REQUIRED_FOR_CLIENT,
  DOCUMENT_LABELS,
  type LegalDocumentType,
} from "../lib/legal-documents.js";

const router = Router();

const acceptSchema = z.object({
  documentType: z.enum(["offer", "personal_data"]),
  documentVersion: z.string().min(1).max(32),
});

function isClient(roles: string[]): boolean {
  return (
    roles.includes("client") &&
    !roles.some((r) => ["admin", "supervisor", "manager", "accountant"].includes(r))
  );
}

router.get("/status", authenticate, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const roles = req.user!.roles;

    if (!isClient(roles)) {
      res.json({ required: [], allAccepted: true });
      return;
    }

    const accepted = await prisma.userConsent.findMany({
      where: { userId },
      select: { documentType: true, documentVersion: true, acceptedAt: true },
    });

    const required = REQUIRED_FOR_CLIENT.map((type) => {
      const currentVersion = CURRENT_VERSIONS[type];
      const match = accepted.find(
        (a) => a.documentType === type && a.documentVersion === currentVersion,
      );
      return {
        type,
        version: currentVersion,
        label: DOCUMENT_LABELS[type],
        accepted: !!match,
        acceptedAt: match?.acceptedAt?.toISOString() ?? null,
      };
    });

    const allAccepted = required.every((r) => r.accepted);
    res.json({ required, allAccepted });
  } catch (err) {
    console.error("GET /api/consents/status error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/accept", authenticate, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const parsed = acceptSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    const { documentType, documentVersion } = parsed.data;

    // Reject if version doesn't match current — user must accept the latest
    if (CURRENT_VERSIONS[documentType as LegalDocumentType] !== documentVersion) {
      res.status(400).json({ error: "Document version is outdated" });
      return;
    }

    const ipAddress = (req.ip || req.socket.remoteAddress || "").slice(0, 64) || null;

    await prisma.userConsent.upsert({
      where: {
        userId_documentType_documentVersion: {
          userId,
          documentType,
          documentVersion,
        },
      },
      create: { userId, documentType, documentVersion, ipAddress },
      update: {}, // already accepted — keep original acceptedAt for audit
    });

    logAudit({
      action: "consent.accept",
      userId,
      entity: "UserConsent",
      details: { documentType, documentVersion, ipAddress },
    }).catch(console.error);

    res.json({ ok: true });
  } catch (err) {
    console.error("POST /api/consents/accept error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
