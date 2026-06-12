import { Router } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../../lib/prisma.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { logAudit } from "../../lib/audit.js";
import { recalcOrgDebt } from "../../lib/debt.js";
import { getStaffOrgIds } from "./helpers.js";

const router = Router();

// ─── Manual match ────────────────────────────────────────────────────────────

// PUT /api/payments/transactions/:id/match — manually match transaction
router.put(
  "/transactions/:id/match",
  authenticate,
  requireRole("admin", "supervisor"),
  async (req, res) => {
    try {
      const { organizationId } = req.body;

      // Get the old orgId before updating (to recalc its debt too)
      const old = await prisma.bankTransaction.findUnique({
        where: { id: req.params.id },
        select: { organizationId: true },
      });

      const tx = await prisma.bankTransaction.update({
        where: { id: req.params.id },
        data: {
          organizationId: organizationId || null,
          matchStatus: organizationId ? "MANUAL" : "UNMATCHED",
          matchedAt: organizationId ? new Date() : null,
          matchedBy: organizationId ? req.user!.userId : null,
        },
      });

      // Recalc debt for affected orgs
      if (old?.organizationId) await recalcOrgDebt(old.organizationId);
      if (organizationId && organizationId !== old?.organizationId)
        await recalcOrgDebt(organizationId);

      res.json(tx);
    } catch (err) {
      console.error("Manual match error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// PUT /api/payments/transactions/:id/ignore — mark as ignored
router.put(
  "/transactions/:id/ignore",
  authenticate,
  requireRole("admin", "supervisor"),
  async (req, res) => {
    try {
      const old = await prisma.bankTransaction.findUnique({
        where: { id: req.params.id },
        select: { organizationId: true },
      });

      const tx = await prisma.bankTransaction.update({
        where: { id: req.params.id },
        data: {
          matchStatus: "IGNORED",
          matchedAt: new Date(),
          matchedBy: req.user!.userId,
        },
      });

      if (old?.organizationId) await recalcOrgDebt(old.organizationId);

      res.json(tx);
    } catch (err) {
      console.error("Ignore transaction error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// PUT /api/payments/transactions/:id/unignore — restore from ignored
router.put(
  "/transactions/:id/unignore",
  authenticate,
  requireRole("admin", "supervisor"),
  async (req, res) => {
    try {
      const old = await prisma.bankTransaction.findUnique({
        where: { id: req.params.id },
        select: { organizationId: true },
      });

      const tx = await prisma.bankTransaction.update({
        where: { id: req.params.id },
        data: {
          matchStatus: old?.organizationId ? "MANUAL" : "UNMATCHED",
          matchedAt: old?.organizationId ? new Date() : null,
          matchedBy: old?.organizationId ? req.user!.userId : null,
        },
      });

      if (old?.organizationId) await recalcOrgDebt(old.organizationId);

      await logAudit({
        action: "transaction_unignore",
        userId: req.user!.userId,
        entity: "bank_transaction",
        entityId: req.params.id,
        details: { organizationId: old?.organizationId },
        ipAddress: req.ip,
      });

      res.json(tx);
    } catch (err) {
      console.error("Unignore transaction error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ─── Transactions list ───────────────────────────────────────────────────────

// GET /api/payments/transactions — list with filters
router.get(
  "/transactions",
  authenticate,
  requireRole("admin", "supervisor", "manager", "accountant"),
  async (req, res) => {
    try {
      const {
        page: pageQ,
        limit: limitQ,
        matchStatus,
        month,
        year,
        organizationId,
        clientGroupId,
        search,
      } = req.query;

      const page = Math.max(1, Number(pageQ) || 1);
      const limit = Math.min(100, Math.max(1, Number(limitQ) || 50));
      const skip = (page - 1) * limit;

      const where: Prisma.BankTransactionWhereInput = {};

      // Staff: restrict to their sections' orgs
      const roles: string[] = req.user!.roles || [];
      const isAdmin = roles.includes("admin") || roles.includes("supervisor");
      if (!isAdmin) {
        const staffOrgIds = await getStaffOrgIds(req.user!.userId);
        if (staffOrgIds.length === 0) {
          res.json({ transactions: [], total: 0, page, limit });
          return;
        }
        where.organizationId = { in: staffOrgIds };
      }

      if (matchStatus)
        where.matchStatus = String(
          matchStatus,
        ) as Prisma.EnumTransactionMatchStatusFilter["equals"];
      if (organizationId) {
        // Staff: verify they have access to this org
        if (!isAdmin) {
          const staffOrgIds = await getStaffOrgIds(req.user!.userId);
          if (!staffOrgIds.includes(String(organizationId))) {
            res.json({ transactions: [], total: 0, page, limit });
            return;
          }
        }
        where.organizationId = String(organizationId);
      }
      if (clientGroupId) {
        where.organization = { clientGroupId: String(clientGroupId) };
      }
      if (year && month) {
        const y = Number(year);
        const m = Number(month);
        where.date = {
          gte: new Date(y, m - 1, 1),
          lt: new Date(y, m, 1),
        };
      } else if (year) {
        const y = Number(year);
        where.date = {
          gte: new Date(y, 0, 1),
          lt: new Date(y + 1, 0, 1),
        };
      }
      if (search) {
        const s = String(search);
        where.OR = [
          { payerName: { contains: s, mode: "insensitive" } },
          { payerInn: { contains: s } },
          { purpose: { contains: s, mode: "insensitive" } },
        ];
      }

      const [transactions, total] = await Promise.all([
        prisma.bankTransaction.findMany({
          where,
          orderBy: { date: "desc" },
          skip,
          take: limit,
          include: {
            organization: { select: { id: true, name: true, inn: true } },
          },
        }),
        prisma.bankTransaction.count({ where }),
      ]);

      res.json({ transactions, total, page, limit });
    } catch (err) {
      console.error("List transactions error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ─── Manual transactions ─────────────────────────────────────────────────────

// POST /api/payments/transactions/manual — create a manual transaction
router.post(
  "/transactions/manual",
  authenticate,
  requireRole("admin", "supervisor", "manager", "accountant"),
  async (req, res) => {
    try {
      const { date, amount, organizationId, payerName, purpose } = req.body;
      if (!date || amount == null || amount === "") {
        res.status(400).json({ error: "date and amount are required" });
        return;
      }

      // Staff: verify org belongs to their sections
      const roles: string[] = req.user!.roles || [];
      const isAdmin = roles.includes("admin") || roles.includes("supervisor");
      if (!isAdmin && organizationId) {
        const staffOrgIds = await getStaffOrgIds(req.user!.userId);
        if (!staffOrgIds.includes(String(organizationId))) {
          res.status(403).json({ error: "Нет доступа к этой организации" });
          return;
        }
      }
      const numAmount = Number(amount);
      if (isNaN(numAmount)) {
        res.status(400).json({ error: "amount must be a valid number" });
        return;
      }

      const tx = await prisma.bankTransaction.create({
        data: {
          date: new Date(date),
          amount: new Prisma.Decimal(amount),
          organizationId: organizationId || null,
          payerName: payerName || null,
          purpose: purpose || null,
          isManual: true,
          matchStatus: organizationId ? "MANUAL" : "UNMATCHED",
          matchedAt: organizationId ? new Date() : null,
          matchedBy: organizationId ? req.user!.userId : null,
        },
        include: {
          organization: { select: { id: true, name: true, inn: true } },
        },
      });

      // Recalc debt if assigned to org
      if (organizationId) await recalcOrgDebt(organizationId);

      await logAudit({
        action: "manual_transaction_create",
        userId: req.user!.userId,
        entity: "bank_transaction",
        entityId: tx.id,
        details: { amount: numAmount, date, organizationId, payerName, purpose },
        ipAddress: req.ip,
      });

      res.status(201).json(tx);
    } catch (err) {
      console.error("Create manual transaction error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// DELETE /api/payments/transactions/:id/manual — delete a manual transaction
router.delete(
  "/transactions/:id/manual",
  authenticate,
  requireRole("admin", "supervisor", "manager", "accountant"),
  async (req, res) => {
    try {
      const tx = await prisma.bankTransaction.findUnique({
        where: { id: req.params.id },
        select: { isManual: true, organizationId: true },
      });
      if (!tx) {
        res.status(404).json({ error: "Transaction not found" });
        return;
      }
      if (!tx.isManual) {
        res.status(400).json({ error: "Can only delete manual transactions" });
        return;
      }

      // Staff: тот же скоуп, что и при создании — иначе IDOR на удаление чужих
      // транзакций (recalcOrgDebt изменит долг чужой организации)
      const roles: string[] = req.user!.roles || [];
      const isAdmin = roles.includes("admin") || roles.includes("supervisor");
      if (!isAdmin && tx.organizationId) {
        const staffOrgIds = await getStaffOrgIds(req.user!.userId);
        if (!staffOrgIds.includes(tx.organizationId)) {
          res.status(403).json({ error: "Нет доступа к этой организации" });
          return;
        }
      }

      await prisma.bankTransaction.delete({ where: { id: req.params.id } });

      if (tx.organizationId) await recalcOrgDebt(tx.organizationId);

      await logAudit({
        action: "manual_transaction_delete",
        userId: req.user!.userId,
        entity: "bank_transaction",
        entityId: req.params.id,
        details: { organizationId: tx.organizationId },
        ipAddress: req.ip,
      });

      res.json({ success: true });
    } catch (err) {
      console.error("Delete manual transaction error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
