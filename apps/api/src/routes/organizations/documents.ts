import { Router, type Request, type Response, type NextFunction } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import prisma from "../../lib/prisma.js";
import { logAudit } from "../../lib/audit.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { orgStrictScope } from "../../lib/scoping.js";
import { createDocumentSchema } from "../../lib/validators.js";
import { upload, UPLOADS_DIR } from "../../lib/upload.js";

const router = Router();

const getScopedWhere = orgStrictScope;

/** Select fields for document responses (never expose storagePath). */
const documentSelect = {
  id: true,
  organizationId: true,
  type: true,
  originalName: true,
  mimeType: true,
  size: true,
  comment: true,
  uploadedById: true,
  createdAt: true,
  version: true,
  groupId: true,
  isLatest: true,
  documentDate: true,
  periodMonth: true,
  periodYear: true,
  uploadedBy: { select: { firstName: true, lastName: true } },
} as const;

/** Multer wrapper: переводит ошибки загрузки в понятные 400-ответы. */
function handleFileUpload(req: Request, res: Response, next: NextFunction): void {
  upload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ error: "File too large (max 10 MB)" });
        return;
      }
      if (err.code === "LIMIT_UNEXPECTED_FILE") {
        res.status(400).json({ error: "File type not allowed" });
        return;
      }
      res.status(400).json({ error: err.message });
      return;
    }
    if (err) {
      next(err);
      return;
    }
    next();
  });
}

// POST /api/organizations/:id/documents — upload
router.post(
  "/:id/documents",
  authenticate,
  requirePermission("document", "create"),
  handleFileUpload,
  async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "File is required" });
        return;
      }

      const scope = getScopedWhere(req.user!.userId, req.user!.roles);
      const org = await prisma.organization.findFirst({
        where: { id: req.params.id, ...scope },
      });
      if (!org) {
        // Clean up uploaded file
        await fs.unlink(req.file.path).catch(() => {});
        res.status(404).json({ error: "Organization not found" });
        return;
      }

      const result = createDocumentSchema.safeParse(req.body);
      if (!result.success) {
        await fs.unlink(req.file.path).catch(() => {});
        res.status(400).json({ error: "Validation failed", issues: result.error.issues });
        return;
      }

      const originalName = Buffer.from(req.file.originalname, "latin1").toString("utf8");

      const doc = await prisma.organizationDocument.create({
        data: {
          organizationId: org.id,
          type: result.data.type,
          originalName,
          storagePath: req.file.filename,
          mimeType: req.file.mimetype,
          size: req.file.size,
          comment: result.data.comment ?? null,
          uploadedById: req.user!.userId,
          version: 1,
          isLatest: true,
          documentDate: result.data.documentDate ? new Date(result.data.documentDate) : null,
          periodMonth: result.data.periodMonth ?? null,
          periodYear: result.data.periodYear ?? null,
        },
        select: documentSelect,
      });

      await logAudit({
        action: "document_uploaded",
        userId: req.user!.userId,
        entity: "organization",
        entityId: org.id,
        details: {
          documentId: doc.id,
          originalName,
          type: result.data.type,
        },
        ipAddress: req.ip,
      });

      res.status(201).json(doc);
    } catch (err) {
      console.error("Upload document error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// GET /api/organizations/:id/documents — list
router.get(
  "/:id/documents",
  authenticate,
  requirePermission("document", "view"),
  async (req, res) => {
    try {
      const scope = getScopedWhere(req.user!.userId, req.user!.roles);
      const org = await prisma.organization.findFirst({
        where: { id: req.params.id, ...scope },
      });
      if (!org) {
        res.status(404).json({ error: "Organization not found" });
        return;
      }

      const documents = await prisma.organizationDocument.findMany({
        where: { organizationId: org.id, isLatest: true },
        select: documentSelect,
        orderBy: { createdAt: "desc" },
      });

      res.json(documents);
    } catch (err) {
      console.error("List documents error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// GET /api/organizations/:id/documents/:docId/download — download file
router.get(
  "/:id/documents/:docId/download",
  authenticate,
  requirePermission("document", "view"),
  async (req, res) => {
    try {
      const scope = getScopedWhere(req.user!.userId, req.user!.roles);
      const org = await prisma.organization.findFirst({
        where: { id: req.params.id, ...scope },
      });
      if (!org) {
        res.status(404).json({ error: "Organization not found" });
        return;
      }

      const doc = await prisma.organizationDocument.findFirst({
        where: { id: req.params.docId, organizationId: org.id },
      });
      if (!doc) {
        res.status(404).json({ error: "Document not found" });
        return;
      }

      const filePath = path.join(UPLOADS_DIR, doc.storagePath);
      res.download(filePath, doc.originalName);
    } catch (err) {
      console.error("Download document error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// DELETE /api/organizations/:id/documents/:docId
router.delete(
  "/:id/documents/:docId",
  authenticate,
  requirePermission("document", "delete"),
  async (req, res) => {
    try {
      const scope = getScopedWhere(req.user!.userId, req.user!.roles);
      const org = await prisma.organization.findFirst({
        where: { id: req.params.id, ...scope },
      });
      if (!org) {
        res.status(404).json({ error: "Organization not found" });
        return;
      }

      const doc = await prisma.organizationDocument.findFirst({
        where: { id: req.params.docId, organizationId: org.id },
      });
      if (!doc) {
        res.status(404).json({ error: "Document not found" });
        return;
      }

      // Delete file from disk (ignore ENOENT)
      const filePath = path.join(UPLOADS_DIR, doc.storagePath);
      await fs.unlink(filePath).catch((err) => {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      });

      await prisma.organizationDocument.delete({ where: { id: doc.id } });

      // If deleted version was the latest, promote the highest remaining version
      if (doc.isLatest) {
        const next = await prisma.organizationDocument.findFirst({
          where: { groupId: doc.groupId },
          orderBy: { version: "desc" },
        });
        if (next) {
          await prisma.organizationDocument.update({
            where: { id: next.id },
            data: { isLatest: true },
          });
        }
      }

      await logAudit({
        action: "document_deleted",
        userId: req.user!.userId,
        entity: "organization",
        entityId: org.id,
        details: { documentId: doc.id, originalName: doc.originalName },
        ipAddress: req.ip,
      });

      res.json({ message: "Document deleted" });
    } catch (err) {
      console.error("Delete document error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// GET /api/organizations/:id/documents/:docId/versions — list all versions
router.get(
  "/:id/documents/:docId/versions",
  authenticate,
  requirePermission("document", "view"),
  async (req, res) => {
    try {
      const scope = getScopedWhere(req.user!.userId, req.user!.roles);
      const org = await prisma.organization.findFirst({
        where: { id: req.params.id, ...scope },
      });
      if (!org) {
        res.status(404).json({ error: "Organization not found" });
        return;
      }

      const doc = await prisma.organizationDocument.findFirst({
        where: { id: req.params.docId, organizationId: org.id },
      });
      if (!doc) {
        res.status(404).json({ error: "Document not found" });
        return;
      }

      const versions = await prisma.organizationDocument.findMany({
        where: { groupId: doc.groupId },
        select: documentSelect,
        orderBy: { version: "desc" },
      });

      res.json(versions);
    } catch (err) {
      console.error("List document versions error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// POST /api/organizations/:id/documents/:docId/versions — upload new version
router.post(
  "/:id/documents/:docId/versions",
  authenticate,
  requirePermission("document", "create"),
  handleFileUpload,
  async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "File is required" });
        return;
      }

      const scope = getScopedWhere(req.user!.userId, req.user!.roles);
      const org = await prisma.organization.findFirst({
        where: { id: req.params.id, ...scope },
      });
      if (!org) {
        await fs.unlink(req.file.path).catch(() => {});
        res.status(404).json({ error: "Organization not found" });
        return;
      }

      const currentDoc = await prisma.organizationDocument.findFirst({
        where: { id: req.params.docId, organizationId: org.id },
      });
      if (!currentDoc) {
        await fs.unlink(req.file.path).catch(() => {});
        res.status(404).json({ error: "Document not found" });
        return;
      }

      // Find max version in this group
      const maxVersionDoc = await prisma.organizationDocument.findFirst({
        where: { groupId: currentDoc.groupId },
        orderBy: { version: "desc" },
      });
      const nextVersion = (maxVersionDoc?.version ?? 0) + 1;

      // Unset isLatest for all in group, then create new version
      await prisma.organizationDocument.updateMany({
        where: { groupId: currentDoc.groupId },
        data: { isLatest: false },
      });

      const originalName = Buffer.from(req.file.originalname, "latin1").toString("utf8");

      // Parse optional date/period fields from FormData body
      const versionBody = createDocumentSchema
        .pick({ documentDate: true, periodMonth: true, periodYear: true })
        .safeParse(req.body);

      const newDoc = await prisma.organizationDocument.create({
        data: {
          organizationId: org.id,
          type: currentDoc.type,
          originalName,
          storagePath: req.file.filename,
          mimeType: req.file.mimetype,
          size: req.file.size,
          comment: currentDoc.comment,
          uploadedById: req.user!.userId,
          groupId: currentDoc.groupId,
          version: nextVersion,
          isLatest: true,
          documentDate:
            versionBody.success && versionBody.data.documentDate
              ? new Date(versionBody.data.documentDate)
              : null,
          periodMonth: versionBody.success ? (versionBody.data.periodMonth ?? null) : null,
          periodYear: versionBody.success ? (versionBody.data.periodYear ?? null) : null,
        },
        select: documentSelect,
      });

      await logAudit({
        action: "document_version_uploaded",
        userId: req.user!.userId,
        entity: "organization",
        entityId: org.id,
        details: {
          documentId: newDoc.id,
          groupId: currentDoc.groupId,
          version: nextVersion,
          originalName,
        },
        ipAddress: req.ip,
      });

      res.status(201).json(newDoc);
    } catch (err) {
      console.error("Upload document version error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
