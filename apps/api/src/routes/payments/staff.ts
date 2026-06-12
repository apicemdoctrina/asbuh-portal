import { Router } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../../lib/prisma.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { logAudit } from "../../lib/audit.js";
import { recalcOrgDebt } from "../../lib/debt.js";
import { getStaffOrgIds } from "./helpers.js";

const router = Router();

// GET /api/payments/my-transactions — transactions for staff's own orgs
router.get(
  "/my-transactions",
  authenticate,
  requireRole("admin", "supervisor", "manager", "accountant"),
  async (req, res) => {
    try {
      const roles: string[] = req.user!.roles || [];
      const isAdmin = roles.includes("admin") || roles.includes("supervisor");

      let orgIds: string[] | null = null;
      if (!isAdmin) {
        orgIds = await getStaffOrgIds(req.user!.userId);
        if (orgIds.length === 0) {
          res.json({ transactions: [], total: 0, page: 1, limit: 50 });
          return;
        }
      }

      const { page: pageQ, limit: limitQ, search } = req.query;
      const page = Math.max(1, Number(pageQ) || 1);
      const limit = Math.min(100, Math.max(1, Number(limitQ) || 50));
      const skip = (page - 1) * limit;

      const where: Prisma.BankTransactionWhereInput = {};
      if (orgIds) where.organizationId = { in: orgIds };
      if (search) {
        const s = String(search);
        where.OR = [
          { payerName: { contains: s, mode: "insensitive" } },
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
            organization: { select: { id: true, name: true } },
          },
        }),
        prisma.bankTransaction.count({ where }),
      ]);

      res.json({ transactions, total, page, limit });
    } catch (err) {
      console.error("My transactions error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// POST /api/payments/my-transactions/manual — staff adds manual payment for their org
router.post(
  "/my-transactions/manual",
  authenticate,
  requireRole("admin", "supervisor", "manager", "accountant"),
  async (req, res) => {
    try {
      const { amount, date, organizationId, purpose } = req.body;
      if (!amount || !date || !organizationId) {
        res.status(400).json({ error: "amount, date, organizationId required" });
        return;
      }

      const roles: string[] = req.user!.roles || [];
      const isAdmin = roles.includes("admin") || roles.includes("supervisor");

      // Verify org belongs to staff's sections
      if (!isAdmin) {
        const orgIds = await getStaffOrgIds(req.user!.userId);
        if (!orgIds.includes(organizationId)) {
          res.status(403).json({ error: "Нет доступа к этой организации" });
          return;
        }
      }

      const tx = await prisma.bankTransaction.create({
        data: {
          date: new Date(date),
          amount: Number(amount),
          organizationId,
          payerName: purpose || null,
          purpose: purpose || "Оплата нал/карта",
          isManual: true,
          matchStatus: "MANUAL",
          matchedAt: new Date(),
        },
      });

      await logAudit({
        action: "manual_transaction_create",
        userId: req.user!.userId,
        entity: "bank_transaction",
        entityId: tx.id,
        details: { note: `Staff manual: ${amount} for org ${organizationId}` },
      });

      // Recalc debt for the org
      await recalcOrgDebt(organizationId);

      res.status(201).json(tx);
    } catch (err) {
      console.error("Staff manual transaction error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
