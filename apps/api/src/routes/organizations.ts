import { Router } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { logAudit } from "../lib/audit.js";
import { authenticate, requirePermission } from "../middleware/auth.js";
import {
  createOrganizationSchema,
  updateOrganizationSchema,
  createBankAccountSchema,
  updateBankAccountSchema,
  createContactSchema,
  updateContactSchema,
} from "../lib/validators.js";

const router = Router();

/** Build a Prisma `where` filter that enforces data-scoping rules. */
function getScopedWhere(userId: string, roles: string[]): Prisma.OrganizationWhereInput {
  if (roles.includes("admin")) return {};
  if (roles.includes("manager") || roles.includes("accountant")) {
    return {
      section: { members: { some: { userId } } },
    };
  }
  return { members: { some: { userId } } };
}

/** Check if user has only client-level access (no admin/manager/accountant). */
function isClientOnly(roles: string[]): boolean {
  return !roles.some((r) => ["admin", "manager", "accountant"].includes(r));
}

/** Build Prisma data from validated fields, converting decimals. */
function buildOrgData(validated: Record<string, unknown>): Prisma.OrganizationUpdateInput {
  const data: Prisma.OrganizationUpdateInput = {};
  const directFields = [
    "name",
    "inn",
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
  ] as const;

  for (const field of directFields) {
    if (validated[field] !== undefined) {
      (data as Record<string, unknown>)[field] = validated[field];
    }
  }

  // Decimal fields need Prisma.Decimal conversion
  for (const field of ["monthlyPayment", "debtAmount"] as const) {
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

  return data;
}

// GET /api/organizations — list with search, filters, pagination
router.get("/", authenticate, requirePermission("organization", "view"), async (req, res) => {
  try {
    const { search, sectionId, status, page: pageQ, limit: limitQ } = req.query;
    const page = Math.max(1, Number(pageQ) || 1);
    const limit = Math.min(100, Math.max(1, Number(limitQ) || 50));
    const skip = (page - 1) * limit;

    const scope = getScopedWhere(req.user!.userId, req.user!.roles);

    const where: Prisma.OrganizationWhereInput = {
      ...scope,
      ...(sectionId ? { sectionId: String(sectionId) } : {}),
      ...(status ? { status: String(status) } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: String(search), mode: "insensitive" } },
              { inn: { contains: String(search), mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [organizations, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        orderBy: { name: "asc" },
        skip,
        take: limit,
        include: {
          section: { select: { id: true, number: true, name: true } },
          _count: { select: { members: true } },
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
      res.status(400).json({ error: "Validation failed", issues: result.error.issues });
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
    if (validated.monthlyPayment !== undefined) {
      createData.monthlyPayment =
        validated.monthlyPayment === null ? null : new Prisma.Decimal(validated.monthlyPayment);
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

    res.status(201).json(organization);
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
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
    const scope = getScopedWhere(req.user!.userId, req.user!.roles);

    const organization = await prisma.organization.findFirst({
      where: { id: req.params.id, ...scope },
      include: {
        section: { select: { id: true, number: true, name: true } },
        members: {
          include: {
            user: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
          },
        },
        bankAccounts: true,
        contacts: true,
      },
    });

    if (!organization) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }

    // DTO filtering: clients should not see bank account login fields
    if (isClientOnly(req.user!.roles)) {
      for (const account of organization.bankAccounts) {
        delete (account as Record<string, unknown>).login;
      }
    }

    res.json(organization);
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
      res.status(400).json({ error: "Validation failed", issues: result.error.issues });
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

    res.json(organization);
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
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

// POST /api/organizations/:id/members — add member
router.post(
  "/:id/members",
  authenticate,
  requirePermission("organization", "edit"),
  async (req, res) => {
    try {
      const { email, role } = req.body;

      if (!email) {
        res.status(400).json({ error: "email is required" });
        return;
      }

      const memberRole = role || "client";

      const scope = getScopedWhere(req.user!.userId, req.user!.roles);
      const organization = await prisma.organization.findFirst({
        where: { id: req.params.id, ...scope },
      });
      if (!organization) {
        res.status(404).json({ error: "Organization not found" });
        return;
      }

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

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

      res.status(201).json(member);
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        res.status(409).json({ error: "User is already a member of this organization" });
        return;
      }
      console.error("Add organization member error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// DELETE /api/organizations/:id/members/:userId — remove member
router.delete(
  "/:id/members/:userId",
  authenticate,
  requirePermission("organization", "edit"),
  async (req, res) => {
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

      res.json({ message: "Member removed" });
    } catch (err) {
      console.error("Remove organization member error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

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

      const account = await prisma.organizationBankAccount.create({
        data: {
          organizationId: org.id,
          bankName: result.data.bankName,
          accountNumber: result.data.accountNumber ?? null,
          login: result.data.login ?? null,
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

      res.status(201).json(account);
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

      res.json(updated);
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

export default router;
