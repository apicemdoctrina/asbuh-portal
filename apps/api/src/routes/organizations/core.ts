import { Router } from "express";
import { Prisma, type TaxSystem } from "@prisma/client";
import fs from "node:fs/promises";
import path from "node:path";
import prisma from "../../lib/prisma.js";
import { logAudit } from "../../lib/audit.js";
import { authenticate, requirePermission, requireRole } from "../../middleware/auth.js";
import { parsePagination, isPrismaUniqueError, sendZodError } from "../../lib/route-helpers.js";
import { orgStrictScope, orgViewScope, clientGroupScope } from "../../lib/scoping.js";
import { createOrganizationSchema, updateOrganizationSchema } from "../../lib/validators.js";
import { UPLOADS_DIR } from "../../lib/upload.js";
import {
  notifySectionMembers,
  notifyOrgStatusChanged,
  notifyOrgPaymentChanged,
  isClientOnly,
  isAdminLike,
  maskBankAccountSecrets,
  maskSystemAccessSecrets,
  buildOrgData,
} from "./helpers.js";

const router = Router();

// Scope-логика централизована в lib/scoping.ts
const getScopedWhere = orgStrictScope;
const getViewScopeWhere = orgViewScope;

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
      ...(taxSystem ? { taxSystems: { has: String(taxSystem) as TaxSystem } } : {}),
      ...(paymentDestination
        ? {
            paymentDestination: String(
              paymentDestination,
            ) as Prisma.OrganizationWhereInput["paymentDestination"],
          }
        : {}),
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
    if (validated.debtAmount !== undefined) {
      // debtAmount — server-computed; задать стартовый долг вручную может только admin/supervisor
      if (validated.debtAmount !== null && !isAdminLike(req.user!.roles)) {
        res.status(403).json({ error: "Задолженность изменяет только администратор" });
        return;
      }
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
            ...(clientOnly ? {} : { login: true, password: true, apiToken: true }),
            comment: true,
            apiProvider: true,
            apiAccountId: true,
            lastFetchAt: true,
            lastSberSync: true,
            autoFetchEnabled: true,
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
        priceHistory: {
          select: { id: true, price: true, effectiveFrom: true },
          orderBy: { effectiveFrom: "asc" },
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

    // debtAmount — server-computed (recalcOrgDebt/reconcile); вручную меняет только admin/supervisor
    if (validated.debtAmount !== undefined && !isAdminLike(req.user!.roles)) {
      const incoming =
        validated.debtAmount === null ? null : new Prisma.Decimal(validated.debtAmount as string);
      const current = existing.debtAmount;
      const changed =
        (incoming == null) !== (current == null) ||
        (incoming != null && current != null && !incoming.equals(current));
      if (changed) {
        res.status(403).json({ error: "Задолженность изменяет только администратор" });
        return;
      }
      delete (validated as Record<string, unknown>).debtAmount;
    }

    // clientGroupId — группа должна существовать и быть в скоупе вызывающего
    // (иначе подмена группового долга через привязку к чужой группе)
    if (validated.clientGroupId) {
      const group = await prisma.clientGroup.findFirst({
        where: {
          id: validated.clientGroupId,
          ...clientGroupScope(req.user!.userId, req.user!.roles),
        },
        select: { id: true },
      });
      if (!group) {
        res.status(404).json({ error: "Client group not found" });
        return;
      }
    }

    // monthlyPayment при наличии истории цен — read-only производная (последняя цена):
    // прямое изменение рассинхронизировало бы calcExpected/долг — меняется через price-history
    if (validated.monthlyPayment !== undefined) {
      const incoming =
        validated.monthlyPayment === null
          ? null
          : new Prisma.Decimal(validated.monthlyPayment as string);
      const current = existing.monthlyPayment;
      const changed =
        (incoming == null) !== (current == null) ||
        (incoming != null && current != null && !incoming.equals(current));
      if (changed) {
        const historyCount = await prisma.priceHistory.count({
          where: { organizationId: req.params.id },
        });
        if (historyCount > 0) {
          res.status(409).json({
            error: "Сумма оплаты управляется историей цен — измените её в блоке «История цен»",
          });
          return;
        }
      } else {
        delete (validated as Record<string, unknown>).monthlyPayment;
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

    // Notify section members if org status changed
    if (validated.status !== undefined && validated.status !== existing.status) {
      notifyOrgStatusChanged(
        organization.id,
        existing.status,
        organization.status,
        req.user!.userId,
      ).catch(console.error);
    }

    // Notify section members if monthlyPayment changed via direct PUT (not via price-history)
    if (validated.monthlyPayment !== undefined) {
      const before = existing.monthlyPayment;
      const after = organization.monthlyPayment;
      const changed =
        (before == null) !== (after == null) ||
        (before != null && after != null && !before.equals(after));
      if (changed) {
        notifyOrgPaymentChanged(organization.id, before, after, req.user!.userId).catch(
          console.error,
        );
      }
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
