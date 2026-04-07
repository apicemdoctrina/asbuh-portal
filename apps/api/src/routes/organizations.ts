import { Router } from "express";
import { Prisma } from "@prisma/client";
import fs from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import rateLimit from "express-rate-limit";
import prisma from "../lib/prisma.js";
import { logAudit } from "../lib/audit.js";
import { notifyWithTelegram } from "../lib/notify.js";
import { generateTaskTemplates } from "../lib/task-generator.js";
import { encrypt, decrypt } from "../lib/crypto.js";
import { authenticate, requirePermission, requireRole } from "../middleware/auth.js";
import { parsePagination, isPrismaUniqueError, sendZodError } from "../lib/route-helpers.js";
import {
  createOrganizationSchema,
  updateOrganizationSchema,
  createBankAccountSchema,
  updateBankAccountSchema,
  createSystemAccessSchema,
  updateSystemAccessSchema,
  createContactSchema,
  updateContactSchema,
  createDocumentSchema,
} from "../lib/validators.js";
import { upload, UPLOADS_DIR } from "../lib/upload.js";

const secretsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "Too many secret view requests, try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

const router = Router();

/** Strict scope — own sections only. Used for write operations (PUT/DELETE). */
function getScopedWhere(userId: string, roles: string[]): Prisma.OrganizationWhereInput {
  if (roles.includes("admin") || roles.includes("supervisor")) return {};
  if (roles.includes("manager") || roles.includes("accountant")) {
    return {
      section: { members: { some: { userId } } },
    };
  }
  return { members: { some: { userId } } };
}

/**
 * View scope — own sections PLUS orgs in any client group that contains
 * at least one org from the user's sections.  Used for GET list/detail.
 */
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

/** Notify all section members (except actorUserId) that a new org was added to their section. */
async function notifySectionMembers(
  sectionId: string,
  orgName: string,
  orgId: string,
  actorUserId: string,
): Promise<void> {
  const members = await prisma.sectionMember.findMany({
    where: { sectionId, userId: { not: actorUserId } },
    select: { userId: true, section: { select: { number: true } } },
  });
  await Promise.all(
    members.map((m) =>
      notifyWithTelegram(
        m.userId,
        "org_added_to_section",
        "Новая организация на участке",
        `Организация «${orgName}» добавлена на участок №${m.section.number}`,
        `/organizations/${orgId}`,
        `🏢 <b>Новая организация на участке №${m.section.number}</b>\n\n«${orgName}»`,
      ),
    ),
  );
}

/** Check if user has only client-level access (no admin/manager/accountant). */
function isClientOnly(roles: string[]): boolean {
  return !roles.some((r) => ["admin", "manager", "accountant"].includes(r));
}

/** Mask bank account secrets for staff: login/password → "***", null stays null. */
function maskBankAccountSecrets(
  accounts: Array<Record<string, unknown>>,
  stripForClient: boolean,
): void {
  for (const account of accounts) {
    if (stripForClient) {
      delete account.login;
      delete account.password;
    } else {
      account.login = account.login != null ? "***" : null;
      account.password = account.password != null ? "***" : null;
    }
  }
}

/** Mask system access secrets identically to bank accounts. */
function maskSystemAccessSecrets(
  accesses: Array<Record<string, unknown>> | null | undefined,
  stripForClient: boolean,
): void {
  if (!accesses) return;
  for (const access of accesses) {
    if (stripForClient) {
      delete access.login;
      delete access.password;
    } else {
      access.login = access.login != null ? "***" : null;
      access.password = access.password != null ? "***" : null;
    }
  }
}

/** Build Prisma data from validated fields, converting decimals. */
function buildOrgData(validated: Record<string, unknown>): Prisma.OrganizationUpdateInput {
  const data: Prisma.OrganizationUpdateInput = {};
  const directFields = [
    "name",
    "inn",
    "ogrn",
    "form",
    "status",
    "taxSystems",
    "employeeCount",
    "opsPerMonth",
    "hasCashRegister",
    "kpp",
    "legalAddress",
    "digitalSignature",
    "digitalSignatureExpiry",
    "reportingChannel",
    "serviceType",
    "paymentDestination",
    "paymentFrequency",
    "serviceStartDate",
    "priceChangeDate",
    "importantComment",
    "checkingAccount",
    "bik",
    "correspondentAccount",
    "requisitesBank",
  ] as const;

  for (const field of directFields) {
    if (validated[field] !== undefined) {
      (data as Record<string, unknown>)[field] = validated[field];
    }
  }

  // Decimal fields need Prisma.Decimal conversion
  for (const field of ["monthlyPayment", "previousMonthlyPayment", "debtAmount"] as const) {
    if (validated[field] !== undefined) {
      const val = validated[field];
      (data as Record<string, unknown>)[field] =
        val === null ? null : new Prisma.Decimal(val as string);
    }
  }

  // sectionId → relation connect/disconnect
  if (validated.sectionId !== undefined) {
    data.section = validated.sectionId
      ? { connect: { id: validated.sectionId as string } }
      : { disconnect: true };
  }

  // clientGroupId → relation connect/disconnect
  if (validated.clientGroupId !== undefined) {
    data.clientGroup = validated.clientGroupId
      ? { connect: { id: validated.clientGroupId as string } }
      : { disconnect: true };
  }

  return data;
}

// GET /api/organizations — list with search, filters, pagination
router.get("/", authenticate, requirePermission("organization", "view"), async (req, res) => {
  try {
    const {
      search,
      sectionId,
      clientGroupId,
      status,
      archived,
      taxSystem,
      paymentDestination,
      sortBy,
      sortOrder,
      page: pageQ,
      limit: limitQ,
    } = req.query;
    const { page, limit, skip } = parsePagination(pageQ, limitQ, 1000);

    const ARCHIVED_STATUSES = ["left", "closed"];
    const SORTABLE_FIELDS = [
      "name",
      "monthlyPayment",
      "debtAmount",
      "employeeCount",
      "form",
      "serviceType",
      "reportingChannel",
      "digitalSignatureExpiry",
    ] as const;
    type SortField = (typeof SORTABLE_FIELDS)[number];

    const scope = getViewScopeWhere(req.user!.userId, req.user!.roles);

    const statusFilter: Prisma.OrganizationWhereInput =
      archived === "true"
        ? { status: { in: ARCHIVED_STATUSES } }
        : status
          ? { status: String(status) }
          : { status: { notIn: [...ARCHIVED_STATUSES, "archived"] } };

    const where: Prisma.OrganizationWhereInput = {
      ...scope,
      ...(sectionId ? { sectionId: String(sectionId) } : {}),
      ...(clientGroupId ? { clientGroupId: String(clientGroupId) } : {}),
      ...statusFilter,
      ...(taxSystem ? { taxSystems: { has: String(taxSystem) } } : {}),
      ...(paymentDestination ? { paymentDestination: String(paymentDestination) } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: String(search), mode: "insensitive" } },
              { inn: { contains: String(search), mode: "insensitive" } },
            ],
          }
        : {}),
    };

    // name — обязательное поле, nulls: "last" нельзя; все остальные поля — nullable
    const REQUIRED_SORT_FIELDS = new Set(["name"]);
    const sortField: SortField = SORTABLE_FIELDS.includes(String(sortBy) as SortField)
      ? (String(sortBy) as SortField)
      : "name";
    const sortDir = sortOrder === "desc" ? "desc" : "asc";
    const orderBy: Prisma.OrganizationOrderByWithRelationInput = REQUIRED_SORT_FIELDS.has(sortField)
      ? { [sortField]: sortDir }
      : { [sortField]: { sort: sortDir, nulls: "last" } };

    const [organizations, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          section: { select: { id: true, number: true, name: true, animal: true } },
          clientGroup: { select: { id: true, name: true } },
          members: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
        },
      }),
      prisma.organization.count({ where }),
    ]);

    res.json({ organizations, total, page, limit });
  } catch (err) {
    console.error("List organizations error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/organizations — create
router.post("/", authenticate, requirePermission("organization", "create"), async (req, res) => {
  try {
    const result = createOrganizationSchema.safeParse(req.body);
    if (!result.success) {
      sendZodError(res, result.error);
      return;
    }

    const validated = result.data;

    if (validated.sectionId) {
      const section = await prisma.section.findUnique({
        where: { id: validated.sectionId },
      });
      if (!section) {
        res.status(404).json({ error: "Section not found" });
        return;
      }
      if (!req.user!.roles.some((r) => ["admin", "supervisor"].includes(r))) {
        const membership = await prisma.sectionMember.findFirst({
          where: { sectionId: validated.sectionId, userId: req.user!.userId },
        });
        if (!membership) {
          res.status(403).json({ error: "No access to this section" });
          return;
        }
      }
    }

    const createData: Record<string, unknown> = {
      name: validated.name,
      inn: validated.inn ?? null,
      form: validated.form ?? null,
      status: validated.status ?? "active",
      sectionId: validated.sectionId ?? null,
    };

    // Optional new fields
    if (validated.taxSystems !== undefined) createData.taxSystems = validated.taxSystems;
    if (validated.employeeCount !== undefined) createData.employeeCount = validated.employeeCount;
    if (validated.opsPerMonth !== undefined) createData.opsPerMonth = validated.opsPerMonth;
    if (validated.hasCashRegister !== undefined)
      createData.hasCashRegister = validated.hasCashRegister;
    if (validated.kpp !== undefined) createData.kpp = validated.kpp;
    if (validated.legalAddress !== undefined) createData.legalAddress = validated.legalAddress;
    if (validated.digitalSignature !== undefined)
      createData.digitalSignature = validated.digitalSignature;
    if (validated.digitalSignatureExpiry !== undefined)
      createData.digitalSignatureExpiry = validated.digitalSignatureExpiry;
    if (validated.reportingChannel !== undefined)
      createData.reportingChannel = validated.reportingChannel;
    if (validated.serviceType !== undefined) createData.serviceType = validated.serviceType;
    if (validated.paymentDestination !== undefined)
      createData.paymentDestination = validated.paymentDestination;
    if (validated.paymentFrequency !== undefined)
      createData.paymentFrequency = validated.paymentFrequency;
    if (validated.serviceStartDate !== undefined)
      createData.serviceStartDate = validated.serviceStartDate;
    if (validated.priceChangeDate !== undefined)
      createData.priceChangeDate = validated.priceChangeDate;
    if (validated.ogrn !== undefined) createData.ogrn = validated.ogrn;
    if (validated.importantComment !== undefined)
      createData.importantComment = validated.importantComment;
    if (validated.checkingAccount !== undefined)
      createData.checkingAccount = validated.checkingAccount;
    if (validated.bik !== undefined) createData.bik = validated.bik;
    if (validated.correspondentAccount !== undefined)
      createData.correspondentAccount = validated.correspondentAccount;
    if (validated.requisitesBank !== undefined)
      createData.requisitesBank = validated.requisitesBank;
    if (validated.monthlyPayment !== undefined) {
      createData.monthlyPayment =
        validated.monthlyPayment === null ? null : new Prisma.Decimal(validated.monthlyPayment);
    }
    if (validated.previousMonthlyPayment !== undefined) {
      createData.previousMonthlyPayment =
        validated.previousMonthlyPayment === null
          ? null
          : new Prisma.Decimal(validated.previousMonthlyPayment);
    }
    if (validated.debtAmount !== undefined) {
      createData.debtAmount =
        validated.debtAmount === null ? null : new Prisma.Decimal(validated.debtAmount);
    }

    const organization = await prisma.organization.create({
      data: createData as Prisma.OrganizationCreateInput,
    });

    await logAudit({
      action: "organization_created",
      userId: req.user!.userId,
      entity: "organization",
      entityId: organization.id,
      details: { name: validated.name },
      ipAddress: req.ip,
    });

    if (validated.sectionId) {
      notifySectionMembers(
        validated.sectionId,
        organization.name,
        organization.id,
        req.user!.userId,
      ).catch(console.error);
    }

    res.status(201).json(organization);
  } catch (err: unknown) {
    if (isPrismaUniqueError(err)) {
      res.status(409).json({ error: "Organization with this INN already exists" });
      return;
    }
    console.error("Create organization error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/organizations/bulk/members — list unique members of given orgs (for removal picker)
router.post("/bulk/members", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { organizationIds } = req.body as { organizationIds?: string[] };
    if (!Array.isArray(organizationIds) || organizationIds.length === 0) {
      res.status(400).json({ error: "organizationIds (non-empty array) is required" });
      return;
    }
    const users = await prisma.user.findMany({
      where: { organizationMembers: { some: { organizationId: { in: organizationIds } } } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    res.json(users);
  } catch (err) {
    console.error("Bulk members error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/organizations/bulk/non-members — users not yet assigned to any of the given orgs
router.post("/bulk/non-members", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { organizationIds } = req.body as { organizationIds?: string[] };
    if (!Array.isArray(organizationIds) || organizationIds.length === 0) {
      res.status(400).json({ error: "organizationIds (non-empty array) is required" });
      return;
    }
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        NOT: { organizationMembers: { some: { organizationId: { in: organizationIds } } } },
      },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: { lastName: "asc" },
    });
    res.json(users);
  } catch (err) {
    console.error("Bulk non-members error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/organizations/bulk/assign — assign a user as responsible to multiple orgs
router.post("/bulk/assign", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { organizationIds, userId } = req.body as {
      organizationIds?: string[];
      userId?: string;
    };
    if (!Array.isArray(organizationIds) || organizationIds.length === 0 || !userId) {
      res.status(400).json({ error: "organizationIds (non-empty array) and userId are required" });
      return;
    }
    const result = await prisma.organizationMember.createMany({
      data: organizationIds.map((orgId) => ({
        organizationId: orgId,
        userId,
        role: "responsible",
      })),
      skipDuplicates: true,
    });
    await logAudit({
      action: "org_bulk_assign",
      userId: req.user!.userId,
      entity: "organization",
      details: { organizationIds, targetUserId: userId },
      ipAddress: req.ip,
    });

    if (result.count > 0) {
      const orgs = await prisma.organization.findMany({
        where: { id: { in: organizationIds } },
        select: { name: true },
      });
      const names = orgs.map((o) => `«${o.name}»`).join(", ");
      const bodyText =
        result.count > 1
          ? `Вы назначены ответственным за ${result.count} организации: ${names}`
          : `Вы назначены ответственным за организацию ${names}`;
      const tgText =
        result.count > 1
          ? `👤 <b>Вы назначены ответственным</b>\n\nОрганизации (${result.count}):\n${orgs.map((o) => `• «${o.name}»`).join("\n")}`
          : `👤 <b>Вы назначены ответственным</b>\n\nОрганизация: ${names}`;
      notifyWithTelegram(
        userId,
        "org_member_assigned",
        "Назначены ответственным",
        bodyText,
        undefined,
        tgText,
      ).catch(console.error);
    }

    res.json({ assigned: result.count });
  } catch (err) {
    console.error("Bulk assign error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/organizations/bulk/remove — remove a user from multiple orgs
router.post("/bulk/remove", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { organizationIds, userId } = req.body as {
      organizationIds?: string[];
      userId?: string;
    };
    if (!Array.isArray(organizationIds) || organizationIds.length === 0 || !userId) {
      res.status(400).json({ error: "organizationIds (non-empty array) and userId are required" });
      return;
    }
    const orgsToRemove = await prisma.organization.findMany({
      where: { id: { in: organizationIds } },
      select: { name: true },
    });
    const result = await prisma.organizationMember.deleteMany({
      where: { organizationId: { in: organizationIds }, userId },
    });
    await logAudit({
      action: "org_bulk_remove",
      userId: req.user!.userId,
      entity: "organization",
      details: { organizationIds, targetUserId: userId },
      ipAddress: req.ip,
    });

    if (result.count > 0) {
      const names = orgsToRemove.map((o) => `«${o.name}»`).join(", ");
      const bodyText =
        result.count > 1
          ? `Вы сняты с ответственности за ${result.count} организации: ${names}`
          : `Вы сняты с ответственности за организацию ${names}`;
      const tgText =
        result.count > 1
          ? `❌ <b>Вы сняты с ответственности</b>\n\nОрганизации (${result.count}):\n${orgsToRemove.map((o) => `• «${o.name}»`).join("\n")}`
          : `❌ <b>Вы сняты с ответственности</b>\n\nОрганизация: ${names}`;
      notifyWithTelegram(
        userId,
        "org_member_removed",
        "Сняты с организации",
        bodyText,
        undefined,
        tgText,
      ).catch(console.error);
    }

    res.json({ removed: result.count });
  } catch (err) {
    console.error("Bulk remove error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/organizations/:id — details + section + members + bankAccounts + contacts
router.get("/:id", authenticate, requirePermission("organization", "view"), async (req, res) => {
  try {
    const viewScope = getViewScopeWhere(req.user!.userId, req.user!.roles);
    const editScope = getScopedWhere(req.user!.userId, req.user!.roles);

    const clientOnly = isClientOnly(req.user!.roles);

    const organization = await prisma.organization.findFirst({
      where: { id: req.params.id, ...viewScope },
      include: {
        section: { select: { id: true, number: true, name: true, animal: true } },
        clientGroup: {
          select: {
            id: true,
            name: true,
            description: true,
            _count: { select: { organizations: true } },
          },
        },
        members: {
          include: {
            user: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
          },
        },
        bankAccounts: {
          select: {
            id: true,
            organizationId: true,
            bankName: true,
            accountNumber: true,
            // skip encrypted fields entirely for clients — they're stripped anyway
            ...(clientOnly ? {} : { login: true, password: true }),
            comment: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        systemAccesses: {
          select: {
            id: true,
            organizationId: true,
            systemType: true,
            name: true,
            ...(clientOnly ? {} : { login: true, password: true }),
            comment: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
        contacts: {
          select: {
            id: true,
            organizationId: true,
            contactPerson: true,
            phone: true,
            email: true,
            telegram: true,
            comment: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        documents: {
          where: { isLatest: true },
          select: {
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
            documentDate: true,
            periodMonth: true,
            periodYear: true,
            uploadedBy: { select: { firstName: true, lastName: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!organization) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }

    // Strip login/password for clients entirely; mask as "***" for staff
    maskBankAccountSecrets(
      organization.bankAccounts as unknown as Array<Record<string, unknown>>,
      clientOnly,
    );
    maskSystemAccessSecrets(
      organization.systemAccesses as unknown as Array<Record<string, unknown>>,
      clientOnly,
    );

    // _editable: true when the user can write to this org (strict scope check)
    const editScopeKeys = Object.keys(editScope);
    const editable =
      editScopeKeys.length === 0
        ? true
        : !!(await prisma.organization.findFirst({
            where: { id: organization.id, ...editScope },
            select: { id: true },
          }));

    res.json({ ...organization, _editable: editable });
  } catch (err) {
    console.error("Get organization error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/organizations/:id — update
router.put("/:id", authenticate, requirePermission("organization", "edit"), async (req, res) => {
  try {
    const result = updateOrganizationSchema.safeParse(req.body);
    if (!result.success) {
      sendZodError(res, result.error);
      return;
    }

    const scope = getScopedWhere(req.user!.userId, req.user!.roles);
    const existing = await prisma.organization.findFirst({
      where: { id: req.params.id, ...scope },
    });
    if (!existing) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }

    const validated = result.data;

    if (validated.sectionId) {
      const section = await prisma.section.findUnique({
        where: { id: validated.sectionId },
      });
      if (!section) {
        res.status(404).json({ error: "Section not found" });
        return;
      }
      if (!req.user!.roles.some((r) => ["admin", "supervisor"].includes(r))) {
        const membership = await prisma.sectionMember.findFirst({
          where: { sectionId: validated.sectionId, userId: req.user!.userId },
        });
        if (!membership) {
          res.status(403).json({ error: "No access to this section" });
          return;
        }
      }
    }

    const data = buildOrgData(validated as Record<string, unknown>);

    const organization = await prisma.organization.update({
      where: { id: req.params.id },
      data,
    });

    await logAudit({
      action: "organization_updated",
      userId: req.user!.userId,
      entity: "organization",
      entityId: organization.id,
      details: validated,
      ipAddress: req.ip,
    });

    // Notify section members if org was moved to a new section
    if (validated.sectionId && validated.sectionId !== existing.sectionId) {
      notifySectionMembers(
        validated.sectionId,
        organization.name,
        organization.id,
        req.user!.userId,
      ).catch(console.error);
    }

    res.json(organization);
  } catch (err: unknown) {
    if (isPrismaUniqueError(err)) {
      res.status(409).json({ error: "Organization with this INN already exists" });
      return;
    }
    console.error("Update organization error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/organizations/:id — archive (status → "archived")
router.delete(
  "/:id",
  authenticate,
  requirePermission("organization", "delete"),
  async (req, res) => {
    try {
      const scope = getScopedWhere(req.user!.userId, req.user!.roles);
      const existing = await prisma.organization.findFirst({
        where: { id: req.params.id, ...scope },
      });
      if (!existing) {
        res.status(404).json({ error: "Organization not found" });
        return;
      }

      const organization = await prisma.organization.update({
        where: { id: req.params.id },
        data: { status: "archived" },
      });

      await logAudit({
        action: "organization_archived",
        userId: req.user!.userId,
        entity: "organization",
        entityId: organization.id,
        details: { name: organization.name },
        ipAddress: req.ip,
      });

      res.json({ message: "Organization archived" });
    } catch (err) {
      console.error("Archive organization error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// POST /api/organizations/:id/members — add member (admin only)
router.post("/:id/members", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: "email is required" });
      return;
    }

    const scope = getScopedWhere(req.user!.userId, req.user!.roles);
    const organization = await prisma.organization.findFirst({
      where: { id: req.params.id, ...scope },
    });
    if (!organization) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { userRoles: { include: { role: { select: { name: true } } } } },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const memberRole = user.userRoles[0]?.role.name ?? "client";

    const member = await prisma.organizationMember.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: memberRole,
      },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    await logAudit({
      action: "organization_member_added",
      userId: req.user!.userId,
      entity: "organization",
      entityId: organization.id,
      details: { memberId: user.id, email, role: memberRole },
      ipAddress: req.ip,
    });

    notifyWithTelegram(
      user.id,
      "org_member_assigned",
      "Назначены ответственным",
      `Вы назначены ответственным за организацию «${organization.name}»`,
      `/organizations/${organization.id}`,
      `👤 <b>Вы назначены ответственным</b>\n\nОрганизация: «${organization.name}»`,
    ).catch(console.error);

    res.status(201).json(member);
  } catch (err: unknown) {
    if (isPrismaUniqueError(err)) {
      res.status(409).json({ error: "User is already a member of this organization" });
      return;
    }
    console.error("Add organization member error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/organizations/:id/members/:userId — remove member (admin only)
router.delete("/:id/members/:userId", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const scope = getScopedWhere(req.user!.userId, req.user!.roles);
    const organization = await prisma.organization.findFirst({
      where: { id: req.params.id, ...scope },
    });
    if (!organization) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }

    const member = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          organizationId: req.params.id,
          userId: req.params.userId,
        },
      },
    });

    if (!member) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    await prisma.organizationMember.delete({ where: { id: member.id } });

    await logAudit({
      action: "organization_member_removed",
      userId: req.user!.userId,
      entity: "organization",
      entityId: req.params.id,
      details: { removedUserId: req.params.userId },
      ipAddress: req.ip,
    });

    notifyWithTelegram(
      req.params.userId,
      "org_member_removed",
      "Сняты с организации",
      `Вы сняты с ответственности за организацию «${organization.name}»`,
      `/organizations/${organization.id}`,
      `❌ <b>Вы сняты с ответственности</b>\n\nОрганизация: «${organization.name}»`,
    ).catch(console.error);

    res.json({ message: "Member removed" });
  } catch (err) {
    console.error("Remove organization member error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Nested CRUD: Bank Accounts ---

// POST /api/organizations/:id/bank-accounts
router.post(
  "/:id/bank-accounts",
  authenticate,
  requirePermission("organization", "edit"),
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

      const result = createBankAccountSchema.safeParse(req.body);
      if (!result.success) {
        res.status(400).json({ error: "Validation failed", issues: result.error.issues });
        return;
      }

      const loginValue = result.data.login ?? null;
      const passwordValue = result.data.password ?? null;

      const account = await prisma.organizationBankAccount.create({
        data: {
          organizationId: org.id,
          bankName: result.data.bankName,
          accountNumber: result.data.accountNumber ?? null,
          login: loginValue ? encrypt(loginValue) : null,
          password: passwordValue ? encrypt(passwordValue) : null,
          comment: result.data.comment ?? null,
        },
      });

      await logAudit({
        action: "organization_bank_account_created",
        userId: req.user!.userId,
        entity: "organization",
        entityId: org.id,
        details: { bankAccountId: account.id, bankName: result.data.bankName },
        ipAddress: req.ip,
      });

      // Mask secrets in response — never return ciphertext
      const responseAccount = {
        ...account,
        login: account.login != null ? "***" : null,
        password: account.password != null ? "***" : null,
      };
      res.status(201).json(responseAccount);
    } catch (err) {
      console.error("Create bank account error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// PUT /api/organizations/:id/bank-accounts/:accountId
router.put(
  "/:id/bank-accounts/:accountId",
  authenticate,
  requirePermission("organization", "edit"),
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

      const account = await prisma.organizationBankAccount.findFirst({
        where: { id: req.params.accountId, organizationId: org.id },
      });
      if (!account) {
        res.status(404).json({ error: "Bank account not found" });
        return;
      }

      const result = updateBankAccountSchema.safeParse(req.body);
      if (!result.success) {
        res.status(400).json({ error: "Validation failed", issues: result.error.issues });
        return;
      }

      const data: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(result.data)) {
        if (value !== undefined) data[key] = value;
      }

      // Encrypt login/password if provided
      if (data.login !== undefined) {
        data.login = data.login ? encrypt(data.login as string) : null;
      }
      if (data.password !== undefined) {
        data.password = data.password ? encrypt(data.password as string) : null;
      }

      const updated = await prisma.organizationBankAccount.update({
        where: { id: account.id },
        data,
      });

      await logAudit({
        action: "organization_bank_account_updated",
        userId: req.user!.userId,
        entity: "organization",
        entityId: org.id,
        details: { bankAccountId: account.id },
        ipAddress: req.ip,
      });

      // Mask secrets in response
      const responseAccount = {
        ...updated,
        login: updated.login != null ? "***" : null,
        password: updated.password != null ? "***" : null,
      };
      res.json(responseAccount);
    } catch (err) {
      console.error("Update bank account error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// DELETE /api/organizations/:id/bank-accounts/:accountId
router.delete(
  "/:id/bank-accounts/:accountId",
  authenticate,
  requirePermission("organization", "edit"),
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

      const account = await prisma.organizationBankAccount.findFirst({
        where: { id: req.params.accountId, organizationId: org.id },
      });
      if (!account) {
        res.status(404).json({ error: "Bank account not found" });
        return;
      }

      await prisma.organizationBankAccount.delete({ where: { id: account.id } });

      await logAudit({
        action: "organization_bank_account_deleted",
        userId: req.user!.userId,
        entity: "organization",
        entityId: org.id,
        details: { bankAccountId: account.id },
        ipAddress: req.ip,
      });

      res.json({ message: "Bank account deleted" });
    } catch (err) {
      console.error("Delete bank account error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// GET /api/organizations/:id/bank-accounts/:accountId/secrets — decrypt secrets
router.get(
  "/:id/bank-accounts/:accountId/secrets",
  authenticate,
  requirePermission("organization_secret", "view"),
  secretsLimiter,
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

      const account = await prisma.organizationBankAccount.findFirst({
        where: { id: req.params.accountId, organizationId: org.id },
      });
      if (!account) {
        res.status(404).json({ error: "Bank account not found" });
        return;
      }

      const decryptedLogin = account.login ? decrypt(account.login) : null;
      const decryptedPassword = account.password ? decrypt(account.password) : null;

      await logAudit({
        action: "organization_secret_viewed",
        userId: req.user!.userId,
        entity: "organization",
        entityId: org.id,
        details: { bankAccountId: account.id, bankName: account.bankName },
        ipAddress: req.ip,
      });

      res.set("Cache-Control", "no-store");
      res.json({ login: decryptedLogin, password: decryptedPassword });
    } catch (err) {
      console.error("View bank account secrets error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// --- Nested CRUD: System Accesses ---

// POST /api/organizations/:id/system-accesses
router.post(
  "/:id/system-accesses",
  authenticate,
  requirePermission("organization", "edit"),
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

      const result = createSystemAccessSchema.safeParse(req.body);
      if (!result.success) {
        res.status(400).json({ error: "Validation failed", issues: result.error.issues });
        return;
      }

      const loginValue = result.data.login ?? null;
      const passwordValue = result.data.password ?? null;

      const access = await prisma.organizationSystemAccess.create({
        data: {
          organizationId: org.id,
          systemType: result.data.systemType,
          name: result.data.name ?? null,
          login: loginValue ? encrypt(loginValue) : null,
          password: passwordValue ? encrypt(passwordValue) : null,
          comment: result.data.comment ?? null,
        },
      });

      await logAudit({
        action: "organization_system_access_created",
        userId: req.user!.userId,
        entity: "organization",
        entityId: org.id,
        details: { systemAccessId: access.id, systemType: access.systemType },
        ipAddress: req.ip,
      });

      const responseAccess = {
        ...access,
        login: access.login != null ? "***" : null,
        password: access.password != null ? "***" : null,
      };
      res.status(201).json(responseAccess);
    } catch (err) {
      console.error("Create system access error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// PUT /api/organizations/:id/system-accesses/:accessId
router.put(
  "/:id/system-accesses/:accessId",
  authenticate,
  requirePermission("organization", "edit"),
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

      const access = await prisma.organizationSystemAccess.findFirst({
        where: { id: req.params.accessId, organizationId: org.id },
      });
      if (!access) {
        res.status(404).json({ error: "System access not found" });
        return;
      }

      const result = updateSystemAccessSchema.safeParse(req.body);
      if (!result.success) {
        res.status(400).json({ error: "Validation failed", issues: result.error.issues });
        return;
      }

      const data: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(result.data)) {
        if (value !== undefined) data[key] = value;
      }

      if (data.login !== undefined) {
        data.login = data.login ? encrypt(data.login as string) : null;
      }
      if (data.password !== undefined) {
        data.password = data.password ? encrypt(data.password as string) : null;
      }

      const updated = await prisma.organizationSystemAccess.update({
        where: { id: access.id },
        data,
      });

      await logAudit({
        action: "organization_system_access_updated",
        userId: req.user!.userId,
        entity: "organization",
        entityId: org.id,
        details: { systemAccessId: access.id },
        ipAddress: req.ip,
      });

      const responseAccess = {
        ...updated,
        login: updated.login != null ? "***" : null,
        password: updated.password != null ? "***" : null,
      };
      res.json(responseAccess);
    } catch (err) {
      console.error("Update system access error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// DELETE /api/organizations/:id/system-accesses/:accessId
router.delete(
  "/:id/system-accesses/:accessId",
  authenticate,
  requirePermission("organization", "edit"),
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

      const access = await prisma.organizationSystemAccess.findFirst({
        where: { id: req.params.accessId, organizationId: org.id },
      });
      if (!access) {
        res.status(404).json({ error: "System access not found" });
        return;
      }

      await prisma.organizationSystemAccess.delete({ where: { id: access.id } });

      await logAudit({
        action: "organization_system_access_deleted",
        userId: req.user!.userId,
        entity: "organization",
        entityId: org.id,
        details: { systemAccessId: access.id },
        ipAddress: req.ip,
      });

      res.json({ message: "System access deleted" });
    } catch (err) {
      console.error("Delete system access error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// GET /api/organizations/:id/system-accesses/:accessId/secrets
router.get(
  "/:id/system-accesses/:accessId/secrets",
  authenticate,
  requirePermission("organization_secret", "view"),
  secretsLimiter,
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

      const access = await prisma.organizationSystemAccess.findFirst({
        where: { id: req.params.accessId, organizationId: org.id },
      });
      if (!access) {
        res.status(404).json({ error: "System access not found" });
        return;
      }

      const decryptedLogin = access.login ? decrypt(access.login) : null;
      const decryptedPassword = access.password ? decrypt(access.password) : null;

      await logAudit({
        action: "organization_secret_viewed",
        userId: req.user!.userId,
        entity: "organization",
        entityId: org.id,
        details: { systemAccessId: access.id, systemType: access.systemType },
        ipAddress: req.ip,
      });

      res.set("Cache-Control", "no-store");
      res.json({ login: decryptedLogin, password: decryptedPassword });
    } catch (err) {
      console.error("View system access secrets error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// --- Nested CRUD: Contacts ---

// POST /api/organizations/:id/contacts
router.post(
  "/:id/contacts",
  authenticate,
  requirePermission("organization", "edit"),
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

      const result = createContactSchema.safeParse(req.body);
      if (!result.success) {
        res.status(400).json({ error: "Validation failed", issues: result.error.issues });
        return;
      }

      const contact = await prisma.organizationContact.create({
        data: {
          organizationId: org.id,
          contactPerson: result.data.contactPerson,
          phone: result.data.phone ?? null,
          email: result.data.email ?? null,
          telegram: result.data.telegram ?? null,
          comment: result.data.comment ?? null,
        },
      });

      await logAudit({
        action: "organization_contact_created",
        userId: req.user!.userId,
        entity: "organization",
        entityId: org.id,
        details: { contactId: contact.id, contactPerson: result.data.contactPerson },
        ipAddress: req.ip,
      });

      res.status(201).json(contact);
    } catch (err) {
      console.error("Create contact error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// PUT /api/organizations/:id/contacts/:contactId
router.put(
  "/:id/contacts/:contactId",
  authenticate,
  requirePermission("organization", "edit"),
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

      const contact = await prisma.organizationContact.findFirst({
        where: { id: req.params.contactId, organizationId: org.id },
      });
      if (!contact) {
        res.status(404).json({ error: "Contact not found" });
        return;
      }

      const result = updateContactSchema.safeParse(req.body);
      if (!result.success) {
        res.status(400).json({ error: "Validation failed", issues: result.error.issues });
        return;
      }

      const data: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(result.data)) {
        if (value !== undefined) data[key] = value;
      }

      const updated = await prisma.organizationContact.update({
        where: { id: contact.id },
        data,
      });

      await logAudit({
        action: "organization_contact_updated",
        userId: req.user!.userId,
        entity: "organization",
        entityId: org.id,
        details: { contactId: contact.id },
        ipAddress: req.ip,
      });

      res.json(updated);
    } catch (err) {
      console.error("Update contact error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// DELETE /api/organizations/:id/contacts/:contactId
router.delete(
  "/:id/contacts/:contactId",
  authenticate,
  requirePermission("organization", "edit"),
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

      const contact = await prisma.organizationContact.findFirst({
        where: { id: req.params.contactId, organizationId: org.id },
      });
      if (!contact) {
        res.status(404).json({ error: "Contact not found" });
        return;
      }

      await prisma.organizationContact.delete({ where: { id: contact.id } });

      await logAudit({
        action: "organization_contact_deleted",
        userId: req.user!.userId,
        entity: "organization",
        entityId: org.id,
        details: { contactId: contact.id },
        ipAddress: req.ip,
      });

      res.json({ message: "Contact deleted" });
    } catch (err) {
      console.error("Delete contact error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// --- Nested CRUD: Documents ---

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

// POST /api/organizations/:id/documents — upload
router.post(
  "/:id/documents",
  authenticate,
  requirePermission("document", "create"),
  (req, res, next) => {
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
  },
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
  (req, res, next) => {
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
  },
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

// GET /api/organizations/:id/generate-tasks/preview
// Returns tasks that WOULD be created without writing to DB
router.get(
  "/:id/generate-tasks/preview",
  authenticate,
  requirePermission("task", "create"),
  async (req, res) => {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: req.params.id },
        select: {
          form: true,
          taxSystems: true,
          employeeCount: true,
          hasCashRegister: true,
          digitalSignature: true,
          digitalSignatureExpiry: true,
          serviceType: true,
        },
      });
      if (!org) return res.status(404).json({ error: "Organization not found" });

      const templates = generateTaskTemplates(org);

      // Mark which titles already have an active task for this org
      const existing = await prisma.task.findMany({
        where: { organizationId: req.params.id, status: { notIn: ["DONE", "CANCELLED"] } },
        select: { title: true },
      });
      const existingTitles = new Set(existing.map((t) => t.title));

      res.json(templates.map((t) => ({ ...t, alreadyExists: existingTitles.has(t.title) })));
    } catch (err) {
      console.error("generate-tasks preview error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// POST /api/organizations/:id/generate-tasks
// Creates tasks based on organization parameters (skips already-existing ones)
router.post(
  "/:id/generate-tasks",
  authenticate,
  requirePermission("task", "create"),
  async (req, res) => {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: req.params.id },
        select: {
          form: true,
          taxSystems: true,
          employeeCount: true,
          hasCashRegister: true,
          digitalSignature: true,
          digitalSignatureExpiry: true,
          serviceType: true,
          members: { select: { userId: true, role: true } },
        },
      });
      if (!org) return res.status(404).json({ error: "Organization not found" });

      const templates = generateTaskTemplates(org);

      const existing = await prisma.task.findMany({
        where: { organizationId: req.params.id, status: { notIn: ["DONE", "CANCELLED"] } },
        select: { title: true },
      });
      const existingTitles = new Set(existing.map((t) => t.title));

      // Assign to first accountant/manager member if available
      const assignee = org.members.find((m) => ["accountant", "manager"].includes(m.role));

      const toCreate = templates.filter((t) => !existingTitles.has(t.title));

      await prisma.$transaction(
        toCreate.map((t) =>
          prisma.task.create({
            data: {
              ...t,
              organizationId: req.params.id,
              createdById: req.user!.userId,
              assignees: assignee ? { create: [{ userId: assignee.userId }] } : undefined,
            },
          }),
        ),
      );

      await logAudit({
        action: "tasks.generate",
        userId: req.user!.userId,
        entity: "organization",
        entityId: req.params.id,
        details: { generated: toCreate.length, skipped: templates.length - toCreate.length },
      });

      res.json({
        generated: toCreate.length,
        skipped: templates.length - toCreate.length,
      });
    } catch (err) {
      console.error("generate-tasks error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ── PERMANENT DELETE organization (admin only) ────────────────────────────────
router.delete("/:id/permanent", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true },
    });
    if (!org) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }

    // Delete uploaded document files from disk
    const docs = await prisma.organizationDocument.findMany({
      where: { organizationId: org.id },
      select: { storagePath: true },
    });
    for (const doc of docs) {
      const fullPath = path.resolve(UPLOADS_DIR, doc.storagePath);
      await fs.unlink(fullPath).catch(() => {});
    }

    await prisma.organization.delete({ where: { id: org.id } });

    await logAudit({
      action: "delete_organization",
      userId: req.user!.userId,
      entity: "organization",
      entityId: org.id,
      details: { name: org.name },
      ipAddress: req.ip,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Delete organization error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
