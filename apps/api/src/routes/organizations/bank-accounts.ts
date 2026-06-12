import { Router } from "express";
import prisma from "../../lib/prisma.js";
import { logAudit } from "../../lib/audit.js";
import { encrypt, decrypt } from "../../lib/crypto.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { orgStrictScope } from "../../lib/scoping.js";
import { createBankAccountSchema, updateBankAccountSchema } from "../../lib/validators.js";
import { secretsLimiter } from "./helpers.js";

const router = Router();

const getScopedWhere = orgStrictScope;

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
          apiProvider: result.data.apiProvider ?? null,
          apiToken: result.data.apiToken ? encrypt(result.data.apiToken) : null,
          apiAccountId: result.data.apiAccountId ?? null,
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
        apiToken: account.apiToken != null ? "***" : null,
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

      // Encrypt login/password/apiToken if provided
      if (data.login !== undefined) {
        data.login = data.login ? encrypt(data.login as string) : null;
      }
      if (data.password !== undefined) {
        data.password = data.password ? encrypt(data.password as string) : null;
      }
      if (data.apiToken !== undefined) {
        data.apiToken = data.apiToken ? encrypt(data.apiToken as string) : null;
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
        apiToken: updated.apiToken != null ? "***" : null,
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

// GET /api/organizations/:id/bank-accounts/:accountId/statements
// Список выписок по конкретному счёту (фильтр по accountNumber).
router.get(
  "/:id/bank-accounts/:accountId/statements",
  authenticate,
  requirePermission("bank_statement", "view"),
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
      const acc = await prisma.organizationBankAccount.findFirst({
        where: { id: req.params.accountId, organizationId: org.id },
        select: { id: true, accountNumber: true },
      });
      if (!acc) {
        res.status(404).json({ error: "Bank account not found" });
        return;
      }
      if (!acc.accountNumber) {
        res.json([]);
        return;
      }
      const items = await prisma.bankStatement.findMany({
        where: {
          organizationId: org.id,
          accountNumbers: { has: acc.accountNumber },
        },
        select: {
          id: true,
          periodStart: true,
          periodEnd: true,
          openingBalance: true,
          closingBalance: true,
          totalIn: true,
          totalOut: true,
          docCount: true,
          reconcileStatus: true,
          reconcileDiff: true,
          originalName: true,
          createdAt: true,
        },
        orderBy: { periodEnd: "desc" },
      });
      res.json(items);
    } catch (err) {
      console.error("List bank-account statements error:", err);
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

export default router;
