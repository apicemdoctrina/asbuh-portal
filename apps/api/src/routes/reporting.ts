import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { logAudit } from "../lib/audit.js";
import { authenticate, requirePermission, requireRole } from "../middleware/auth.js";
import { sendZodError } from "../lib/route-helpers.js";
import { isReportApplicable } from "../lib/report-task-generator.js";

const router = Router();

// ─── Scope helpers (same pattern as organizations) ───

function getViewScopeWhere(userId: string, roles: string[]): Prisma.OrganizationWhereInput {
  if (roles.includes("admin") || roles.includes("supervisor")) return {};
  if (roles.includes("manager") || roles.includes("accountant")) {
    return {
      OR: [
        { section: { members: { some: { userId } } } },
        {
          clientGroupId: { not: null },
          clientGroup: {
            organizations: {
              some: { section: { members: { some: { userId } } } },
            },
          },
        },
      ],
    };
  }
  return { members: { some: { userId } } };
}

// ─── Validators ───

const reportTypeSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(50),
  description: z.string().max(500).optional().nullable(),
  frequency: z.enum(["MONTHLY", "QUARTERLY", "YEARLY"]),
  order: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const reportEntryUpsertSchema = z.object({
  organizationId: z.string().uuid(),
  reportTypeId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  period: z.number().int().min(0).max(12),
  status: z.enum(["NOT_SUBMITTED", "SUBMITTED", "ACCEPTED", "REJECTED", "NOT_APPLICABLE"]),
  filedAt: z.string().nullable().optional(),
  taxAmount: z.union([z.number(), z.string(), z.null()]).optional().nullable(),
  comment: z.string().max(500).optional().nullable(),
});

// Bulk upsert — array of entries
const bulkUpsertSchema = z.array(reportEntryUpsertSchema);

// ═══════════════════════════════════════
// Report Types CRUD (admin/supervisor only for create/edit/delete)
// ═══════════════════════════════════════

// GET /api/reporting/types — list all report types
router.get("/types", authenticate, requirePermission("reporting", "view"), async (_req, res) => {
  try {
    const types = await prisma.reportType.findMany({
      orderBy: { order: "asc" },
    });
    res.json(types);
  } catch (err) {
    console.error("Error fetching report types:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/reporting/types — create report type
router.post("/types", authenticate, requireRole("admin", "supervisor"), async (req, res) => {
  const parsed = reportTypeSchema.safeParse(req.body);
  if (!parsed.success) return sendZodError(res, parsed.error);

  try {
    const rt = await prisma.reportType.create({ data: parsed.data });
    await logAudit({
      action: "report_type_created",
      userId: req.user!.userId,
      entity: "report_type",
      entityId: rt.id,
      details: { name: rt.name, code: rt.code },
      ipAddress: req.ip,
    });
    res.status(201).json(rt);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "Тип отчёта с таким кодом уже существует" });
    }
    console.error("Error creating report type:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/reporting/types/:id — update report type
router.put("/types/:id", authenticate, requireRole("admin", "supervisor"), async (req, res) => {
  const parsed = reportTypeSchema.partial().safeParse(req.body);
  if (!parsed.success) return sendZodError(res, parsed.error);

  try {
    const rt = await prisma.reportType.update({
      where: { id: req.params.id },
      data: parsed.data,
    });
    res.json(rt);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") return res.status(404).json({ error: "Not found" });
      if (err.code === "P2002") return res.status(409).json({ error: "Код уже занят" });
    }
    console.error("Error updating report type:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/reporting/types/:id
router.delete("/types/:id", authenticate, requireRole("admin", "supervisor"), async (req, res) => {
  try {
    await prisma.reportType.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025")
      return res.status(404).json({ error: "Not found" });
    console.error("Error deleting report type:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ═══════════════════════════════════════
// Report Entries — matrix view & upsert
// ═══════════════════════════════════════

// GET /api/reporting/matrix?year=2026&period=1&frequency=QUARTERLY
// Returns { organizations: [...], reportTypes: [...], entries: { [orgId_reportTypeId]: entry } }
router.get("/matrix", authenticate, requirePermission("reporting", "view"), async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const period = Number(req.query.period) || 0;
    const frequency = (req.query.frequency as string) || "QUARTERLY";

    const user = req.user!;
    const scopeWhere = getViewScopeWhere(user.userId, user.roles);

    // Fetch scoped organizations
    const organizations = await prisma.organization.findMany({
      where: { ...scopeWhere, status: { in: ["active", "new"] } },
      select: {
        id: true,
        name: true,
        inn: true,
        form: true,
        taxSystems: true,
        employeeCount: true,
        section: { select: { id: true, number: true, name: true } },
      },
      orderBy: [{ section: { number: "asc" } }, { name: "asc" }],
    });

    // Fetch active report types for the given frequency
    const reportTypes = await prisma.reportType.findMany({
      where: { isActive: true, frequency: frequency as Prisma.EnumReportFrequencyFilter["equals"] },
      orderBy: { order: "asc" },
    });

    const orgIds = organizations.map((o) => o.id);
    const rtIds = reportTypes.map((rt) => rt.id);

    // Fetch entries for this period
    const entries = await prisma.reportEntry.findMany({
      where: {
        organizationId: { in: orgIds },
        reportTypeId: { in: rtIds },
        year,
        period,
      },
      include: {
        filedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Build lookup map
    const entryMap: Record<string, (typeof entries)[0]> = {};
    for (const e of entries) {
      entryMap[`${e.organizationId}_${e.reportTypeId}`] = e;
    }

    // Build applicability map: orgId_reportTypeId → boolean
    const applicability: Record<string, boolean> = {};
    for (const org of organizations) {
      for (const rt of reportTypes) {
        applicability[`${org.id}_${rt.id}`] = isReportApplicable(rt.code, {
          form: org.form,
          taxSystems: org.taxSystems as string[],
          employeeCount: org.employeeCount,
        });
      }
    }

    res.json({
      organizations,
      reportTypes,
      entries: entryMap,
      applicability,
      year,
      period,
      frequency,
    });
  } catch (err) {
    console.error("Error fetching reporting matrix:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/reporting/entries — bulk upsert entries
router.put("/entries", authenticate, requirePermission("reporting", "edit"), async (req, res) => {
  const parsed = bulkUpsertSchema.safeParse(req.body);
  if (!parsed.success) return sendZodError(res, parsed.error);

  const user = req.user!;

  try {
    const results = await prisma.$transaction(
      parsed.data.map((entry) =>
        prisma.reportEntry.upsert({
          where: {
            organizationId_reportTypeId_year_period: {
              organizationId: entry.organizationId,
              reportTypeId: entry.reportTypeId,
              year: entry.year,
              period: entry.period,
            },
          },
          update: {
            status: entry.status,
            filedAt: entry.filedAt ? new Date(entry.filedAt) : null,
            taxAmount: entry.taxAmount != null ? entry.taxAmount : null,
            comment: entry.comment ?? null,
            filedById: user.userId,
          },
          create: {
            organizationId: entry.organizationId,
            reportTypeId: entry.reportTypeId,
            year: entry.year,
            period: entry.period,
            status: entry.status,
            filedAt: entry.filedAt ? new Date(entry.filedAt) : null,
            taxAmount: entry.taxAmount != null ? entry.taxAmount : null,
            comment: entry.comment ?? null,
            filedById: user.userId,
          },
        }),
      ),
    );

    await logAudit({
      action: "report_entries_updated",
      userId: user.userId,
      entity: "report_entry",
      details: { count: results.length },
      ipAddress: req.ip,
    });

    res.json({ ok: true, count: results.length });
  } catch (err) {
    console.error("Error upserting report entries:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/reporting/entry — single entry upsert (for inline editing)
router.put("/entry", authenticate, requirePermission("reporting", "edit"), async (req, res) => {
  const parsed = reportEntryUpsertSchema.safeParse(req.body);
  if (!parsed.success) return sendZodError(res, parsed.error);

  const user = req.user!;
  const entry = parsed.data;

  try {
    const result = await prisma.reportEntry.upsert({
      where: {
        organizationId_reportTypeId_year_period: {
          organizationId: entry.organizationId,
          reportTypeId: entry.reportTypeId,
          year: entry.year,
          period: entry.period,
        },
      },
      update: {
        status: entry.status,
        filedAt: entry.filedAt ? new Date(entry.filedAt) : null,
        taxAmount: entry.taxAmount != null ? entry.taxAmount : null,
        comment: entry.comment ?? null,
        filedById: user.userId,
      },
      create: {
        organizationId: entry.organizationId,
        reportTypeId: entry.reportTypeId,
        year: entry.year,
        period: entry.period,
        status: entry.status,
        filedAt: entry.filedAt ? new Date(entry.filedAt) : null,
        taxAmount: entry.taxAmount != null ? entry.taxAmount : null,
        comment: entry.comment ?? null,
        filedById: user.userId,
      },
      include: {
        filedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    res.json(result);
  } catch (err) {
    console.error("Error upserting report entry:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
