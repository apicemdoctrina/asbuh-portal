import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import prisma from "../lib/prisma.js";
import { logAudit } from "../lib/audit.js";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { createKnowledgeItemSchema, updateKnowledgeItemSchema } from "../lib/validators.js";
import { upload, UPLOADS_DIR } from "../lib/upload.js";

const router = Router();

const itemSelect = {
  id: true,
  title: true,
  type: true,
  audience: true,
  tags: true,
  description: true,
  content: true,
  url: true,
  coverImagePath: true,
  coverImageName: true,
  originalName: true,
  mimeType: true,
  fileSize: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} as const;

/** Multer middleware that accepts both "file" and "coverImage" fields */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleUploadFields(req: Express.Request, res: any, next: any) {
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "coverImage", maxCount: 1 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ])(req as any, res, (err: any) => {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getUploadedFiles(req: any) {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const file = files?.file?.[0] ?? null;
  const coverImage = files?.coverImage?.[0] ?? null;
  return { file, coverImage };
}

async function cleanupFile(f: Express.Multer.File | null) {
  if (f) await fs.unlink(f.path).catch(() => {});
}

// GET /api/knowledge — list with search, filters, pagination
router.get("/", authenticate, requirePermission("knowledge_item", "view"), async (req, res) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const typeFilter = typeof req.query.type === "string" ? req.query.type : "";
    const audienceFilter = typeof req.query.audience === "string" ? req.query.audience : "";
    const tagFilter = typeof req.query.tag === "string" ? req.query.tag.trim() : "";
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const isClient = req.user!.roles.includes("client");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    // Clients can only see CLIENT audience
    if (isClient) {
      where.audience = "CLIENT";
    } else if (audienceFilter === "STAFF" || audienceFilter === "CLIENT") {
      where.audience = audienceFilter;
    }

    if (typeFilter === "ARTICLE" || typeFilter === "VIDEO" || typeFilter === "FILE") {
      where.type = typeFilter;
    }

    if (tagFilter) {
      where.tags = { has: tagFilter };
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.knowledgeItem.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: itemSelect,
      }),
      prisma.knowledgeItem.count({ where }),
    ]);

    res.json({ data, total, page, limit });
  } catch (err) {
    console.error("Knowledge list error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/knowledge — create
router.post(
  "/",
  authenticate,
  requirePermission("knowledge_item", "create"),
  handleUploadFields,
  async (req, res) => {
    const { file, coverImage } = getUploadedFiles(req);
    try {
      const parsed = createKnowledgeItemSchema.safeParse(req.body);
      if (!parsed.success) {
        await cleanupFile(file);
        await cleanupFile(coverImage);
        res
          .status(400)
          .json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors });
        return;
      }

      const { title, type, audience, tags, description, content, url } = parsed.data;

      if (type === "FILE" && !file) {
        await cleanupFile(coverImage);
        res.status(400).json({ error: "File is required for FILE type" });
        return;
      }

      if (type === "VIDEO" && !url) {
        await cleanupFile(file);
        await cleanupFile(coverImage);
        res.status(400).json({ error: "URL is required for VIDEO type" });
        return;
      }

      const item = await prisma.knowledgeItem.create({
        data: {
          title,
          type,
          audience,
          tags,
          description: description ?? null,
          content: type === "ARTICLE" ? (content ?? null) : null,
          url: type === "VIDEO" ? (url ?? null) : null,
          coverImagePath: coverImage ? coverImage.filename : null,
          coverImageName: coverImage ? coverImage.originalname : null,
          originalName: file ? file.originalname : null,
          storagePath: file ? file.filename : null,
          mimeType: file ? file.mimetype : null,
          fileSize: file ? file.size : null,
          createdById: req.user!.userId,
        },
        select: itemSelect,
      });

      await logAudit({
        action: "knowledge_item.create",
        userId: req.user!.userId,
        entity: "knowledge_item",
        entityId: item.id,
        details: { title, type, audience },
        ipAddress: req.ip,
      });

      res.status(201).json(item);
    } catch (err) {
      console.error("Knowledge create error:", err);
      await cleanupFile(file);
      await cleanupFile(coverImage);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// PUT /api/knowledge/:id — update
router.put(
  "/:id",
  authenticate,
  requirePermission("knowledge_item", "edit"),
  handleUploadFields,
  async (req, res) => {
    const { file, coverImage } = getUploadedFiles(req);
    try {
      const existing = await prisma.knowledgeItem.findUnique({ where: { id: req.params.id } });
      if (!existing) {
        await cleanupFile(file);
        await cleanupFile(coverImage);
        res.status(404).json({ error: "Knowledge item not found" });
        return;
      }

      const parsed = updateKnowledgeItemSchema.safeParse(req.body);
      if (!parsed.success) {
        await cleanupFile(file);
        await cleanupFile(coverImage);
        res
          .status(400)
          .json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors });
        return;
      }

      const updateData: Record<string, unknown> = { ...parsed.data };

      // If a new file is uploaded, replace the old one
      if (file) {
        updateData.originalName = file.originalname;
        updateData.storagePath = file.filename;
        updateData.mimeType = file.mimetype;
        updateData.fileSize = file.size;
        // Delete old file
        if (existing.storagePath) {
          const oldPath = path.join(UPLOADS_DIR, existing.storagePath);
          await fs.unlink(oldPath).catch(() => {});
        }
      }

      // If a new cover image is uploaded, replace the old one
      if (coverImage) {
        updateData.coverImagePath = coverImage.filename;
        updateData.coverImageName = coverImage.originalname;
        if (existing.coverImagePath) {
          const oldPath = path.join(UPLOADS_DIR, existing.coverImagePath);
          await fs.unlink(oldPath).catch(() => {});
        }
      }

      const item = await prisma.knowledgeItem.update({
        where: { id: req.params.id },
        data: updateData,
        select: itemSelect,
      });

      await logAudit({
        action: "knowledge_item.edit",
        userId: req.user!.userId,
        entity: "knowledge_item",
        entityId: item.id,
        details: parsed.data,
        ipAddress: req.ip,
      });

      res.json(item);
    } catch (err) {
      console.error("Knowledge update error:", err);
      await cleanupFile(file);
      await cleanupFile(coverImage);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// DELETE /api/knowledge/:id
router.delete(
  "/:id",
  authenticate,
  requirePermission("knowledge_item", "delete"),
  async (req, res) => {
    try {
      const existing = await prisma.knowledgeItem.findUnique({ where: { id: req.params.id } });
      if (!existing) {
        res.status(404).json({ error: "Knowledge item not found" });
        return;
      }

      await prisma.knowledgeItem.delete({ where: { id: req.params.id } });

      // Delete file from disk if it exists
      if (existing.storagePath) {
        const filePath = path.join(UPLOADS_DIR, existing.storagePath);
        await fs.unlink(filePath).catch((err) => {
          console.error("Failed to delete knowledge file:", err);
        });
      }
      // Delete cover image from disk if it exists
      if (existing.coverImagePath) {
        const coverPath = path.join(UPLOADS_DIR, existing.coverImagePath);
        await fs.unlink(coverPath).catch((err) => {
          console.error("Failed to delete cover image:", err);
        });
      }

      await logAudit({
        action: "knowledge_item.delete",
        userId: req.user!.userId,
        entity: "knowledge_item",
        entityId: req.params.id,
        details: { title: existing.title },
        ipAddress: req.ip,
      });

      res.json({ success: true });
    } catch (err) {
      console.error("Knowledge delete error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// POST /api/knowledge/upload-image — inline image upload for TipTap editor
router.post(
  "/upload-image",
  authenticate,
  requirePermission("knowledge_item", "create"),
  (req, res, next) => {
    upload.single("image")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        res.status(400).json({ error: err.message });
        return;
      }
      if (err) {
        next(err);
        return;
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No image uploaded" });
        return;
      }
      res.json({ url: `/uploads/${req.file.filename}` });
    } catch (err) {
      console.error("Image upload error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// GET /api/knowledge/:id/download — download file
router.get(
  "/:id/download",
  authenticate,
  requirePermission("knowledge_item", "view"),
  async (req, res) => {
    try {
      const isClient = req.user!.roles.includes("client");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const where: any = { id: req.params.id };
      if (isClient) where.audience = "CLIENT";

      const item = await prisma.knowledgeItem.findFirst({ where });
      if (!item) {
        res.status(404).json({ error: "Knowledge item not found" });
        return;
      }

      if (item.type !== "FILE" || !item.storagePath) {
        res.status(400).json({ error: "Item has no downloadable file" });
        return;
      }

      const filePath = path.join(UPLOADS_DIR, item.storagePath);
      res.download(filePath, item.originalName || "file");
    } catch (err) {
      console.error("Knowledge download error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
