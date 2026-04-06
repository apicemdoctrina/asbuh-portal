import { Router } from "express";
import prisma from "../lib/prisma.js";
import { Prisma } from "@prisma/client";
import { authenticate, requireRole } from "../middleware/auth.js";
import { logAudit } from "../lib/audit.js";

const router = Router();

// ─── Tochka Bank API helpers ─────────────────────────────────────────────────

const TOCHKA_API_BASE = "https://enter.tochka.com/api/v2";

async function tochkaFetch(
  path: string,
  accessToken: string,
  opts?: RequestInit,
): Promise<Response> {
  return fetch(`${TOCHKA_API_BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...opts?.headers,
    },
  });
}

// ─── Bank account management ─────────────────────────────────────────────────

// GET /api/payments/accounts — list connected bank accounts
router.get("/accounts", authenticate, requireRole("admin", "supervisor"), async (_req, res) => {
  try {
    const accounts = await prisma.bankAccount.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        bankName: true,
        accountNumber: true,
        isActive: true,
        lastSyncAt: true,
        createdAt: true,
      },
    });
    res.json(accounts);
  } catch (err) {
    console.error("List bank accounts error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/payments/accounts — add bank account
router.post("/accounts", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { bankName, accountNumber, accessToken, refreshToken } = req.body;
    if (!bankName || !accountNumber) {
      res.status(400).json({ error: "bankName and accountNumber are required" });
      return;
    }
    const account = await prisma.bankAccount.create({
      data: {
        bankName,
        accountNumber,
        accessToken: accessToken || null,
        refreshToken: refreshToken || null,
      },
    });
    await logAudit({
      action: "bank_account_added",
      userId: req.user!.userId,
      entity: "bank_account",
      entityId: account.id,
      details: { bankName, accountNumber },
      ipAddress: req.ip,
    });
    res.status(201).json(account);
  } catch (err) {
    console.error("Create bank account error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/payments/accounts/:id — update tokens
router.put("/accounts/:id", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { accessToken, refreshToken, isActive } = req.body;
    const data: Prisma.BankAccountUpdateInput = {};
    if (accessToken !== undefined) data.accessToken = accessToken;
    if (refreshToken !== undefined) data.refreshToken = refreshToken;
    if (isActive !== undefined) data.isActive = isActive;

    const account = await prisma.bankAccount.update({
      where: { id: req.params.id },
      data,
    });
    res.json(account);
  } catch (err) {
    console.error("Update bank account error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Sync transactions from bank ─────────────────────────────────────────────

// POST /api/payments/sync — fetch new transactions from Tochka
router.post("/sync", authenticate, requireRole("admin", "supervisor"), async (req, res) => {
  try {
    const { accountId, dateFrom, dateTo } = req.body;
    const account = await prisma.bankAccount.findUnique({ where: { id: accountId } });
    if (!account || !account.accessToken) {
      res.status(400).json({ error: "Bank account not found or no access token" });
      return;
    }

    const from = dateFrom || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const to = dateTo || new Date().toISOString().slice(0, 10);

    // Fetch statement from Tochka API
    const stmtRes = await tochkaFetch(
      `/statement?accountCode=${account.accountNumber}&from=${from}&till=${to}`,
      account.accessToken,
    );

    if (!stmtRes.ok) {
      const errBody = await stmtRes.text();
      console.error("Tochka API error:", stmtRes.status, errBody);
      res.status(502).json({ error: "Bank API error", details: errBody });
      return;
    }

    const stmtData = await stmtRes.json();
    const operations = stmtData.payments || stmtData.operations || [];

    // Filter only incoming payments (credit)
    const incoming = operations.filter(
      (op: { operationType?: string; amount?: number }) =>
        op.operationType === "credit" || (op.amount && Number(op.amount) > 0),
    );

    let imported = 0;
    let skipped = 0;

    for (const op of incoming) {
      const externalId = String(op.id || op.operationId || op.documentNumber);

      // Skip if already imported
      const exists = await prisma.bankTransaction.findUnique({
        where: { externalId },
      });
      if (exists) {
        skipped++;
        continue;
      }

      await prisma.bankTransaction.create({
        data: {
          bankAccountId: account.id,
          externalId,
          date: new Date(op.date || op.operationDate),
          amount: Number(op.amount || op.paymentAmount || 0),
          payerName: op.payerName || op.counterpartyName || null,
          payerInn: op.payerInn || op.counterpartyInn || null,
          payerAccount: op.payerAccount || op.counterpartyAccountNumber || null,
          purpose: op.purpose || op.paymentPurpose || null,
          matchStatus: "UNMATCHED",
        },
      });
      imported++;
    }

    // Update last sync time
    await prisma.bankAccount.update({
      where: { id: account.id },
      data: { lastSyncAt: new Date() },
    });

    // Run auto-matching
    const matched = await autoMatchTransactions();

    await logAudit({
      action: "bank_sync",
      userId: req.user!.userId,
      entity: "bank_account",
      entityId: account.id,
      details: { from, to, imported, skipped, matched },
      ipAddress: req.ip,
    });

    res.json({ imported, skipped, matched });
  } catch (err) {
    console.error("Sync error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Auto-matching logic ─────────────────────────────────────────────────────

async function autoMatchTransactions(): Promise<number> {
  const unmatched = await prisma.bankTransaction.findMany({
    where: { matchStatus: "UNMATCHED" },
  });

  // Load all active organizations with INN
  const orgs = await prisma.organization.findMany({
    where: {
      status: { notIn: ["left", "closed", "ceased", "archived"] },
      paymentDestination: "BANK_TOCHKA",
    },
    select: { id: true, name: true, inn: true },
  });

  let matchedCount = 0;

  for (const tx of unmatched) {
    let orgId: string | null = null;

    // 1. Match by payer INN
    if (tx.payerInn) {
      const org = orgs.find((o) => o.inn === tx.payerInn);
      if (org) orgId = org.id;
    }

    // 2. Fallback: match by name in payer name or purpose
    if (!orgId) {
      const searchIn = `${tx.payerName || ""} ${tx.purpose || ""}`.toLowerCase();
      const org = orgs.find((o) => {
        if (!o.name) return false;
        // Clean org name for matching (remove quotes, legal form)
        const cleanName = o.name
          .replace(/[«»"']/g, "")
          .replace(/^(ООО|ИП|АО|ПАО|НКО)\s*/i, "")
          .trim()
          .toLowerCase();
        return cleanName.length >= 3 && searchIn.includes(cleanName);
      });
      if (org) orgId = org.id;
    }

    if (orgId) {
      await prisma.bankTransaction.update({
        where: { id: tx.id },
        data: {
          organizationId: orgId,
          matchStatus: "AUTO",
          matchedAt: new Date(),
          matchedBy: "auto",
        },
      });
      matchedCount++;
    }
  }

  return matchedCount;
}

// POST /api/payments/rematch — re-run auto-matching
router.post("/rematch", authenticate, requireRole("admin", "supervisor"), async (_req, res) => {
  try {
    const matched = await autoMatchTransactions();
    res.json({ matched });
  } catch (err) {
    console.error("Rematch error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Manual match ────────────────────────────────────────────────────────────

// PUT /api/payments/transactions/:id/match — manually match transaction
router.put(
  "/transactions/:id/match",
  authenticate,
  requireRole("admin", "supervisor"),
  async (req, res) => {
    try {
      const { organizationId } = req.body;
      const tx = await prisma.bankTransaction.update({
        where: { id: req.params.id },
        data: {
          organizationId: organizationId || null,
          matchStatus: organizationId ? "MANUAL" : "UNMATCHED",
          matchedAt: organizationId ? new Date() : null,
          matchedBy: organizationId ? req.user!.userId : null,
        },
      });
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
      const tx = await prisma.bankTransaction.update({
        where: { id: req.params.id },
        data: {
          matchStatus: "IGNORED",
          matchedAt: new Date(),
          matchedBy: req.user!.userId,
        },
      });
      res.json(tx);
    } catch (err) {
      console.error("Ignore transaction error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ─── Transactions list ───────────────────────────────────────────────────────

// GET /api/payments/transactions — list with filters
router.get("/transactions", authenticate, requireRole("admin", "supervisor"), async (req, res) => {
  try {
    const {
      page: pageQ,
      limit: limitQ,
      matchStatus,
      month,
      year,
      organizationId,
      search,
    } = req.query;

    const page = Math.max(1, Number(pageQ) || 1);
    const limit = Math.min(100, Math.max(1, Number(limitQ) || 50));
    const skip = (page - 1) * limit;

    const where: Prisma.BankTransactionWhereInput = {};
    if (matchStatus)
      where.matchStatus = String(matchStatus) as Prisma.EnumTransactionMatchStatusFilter["equals"];
    if (organizationId) where.organizationId = String(organizationId);
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
});

// ─── Reconciliation ──────────────────────────────────────────────────────────

// POST /api/payments/reconcile — recalculate payment periods
router.post("/reconcile", authenticate, requireRole("admin", "supervisor"), async (req, res) => {
  try {
    const { year, month } = req.body;
    const targetYear = Number(year) || new Date().getFullYear();
    const targetMonth = Number(month) || new Date().getMonth() + 1;

    // Get all orgs that pay via bank
    const orgs = await prisma.organization.findMany({
      where: {
        paymentDestination: "BANK_TOCHKA",
        monthlyPayment: { not: null, gt: 0 },
        status: {
          notIn: ["left", "closed", "not_paying", "ceased", "own", "blacklisted", "archived"],
        },
      },
      select: { id: true, monthlyPayment: true },
    });

    const now = new Date();
    const deadlineDate = new Date(targetYear, targetMonth - 1 + 1, 15); // 15th of next month
    const isOverdueEligible = now > deadlineDate;

    let updated = 0;

    for (const org of orgs) {
      const expected = Number(org.monthlyPayment ?? 0);

      // Sum all matched transactions for this org in this month
      const agg = await prisma.bankTransaction.aggregate({
        where: {
          organizationId: org.id,
          matchStatus: { in: ["AUTO", "MANUAL"] },
          date: {
            gte: new Date(targetYear, targetMonth - 1, 1),
            lt: new Date(targetYear, targetMonth, 1),
          },
        },
        _sum: { amount: true },
      });

      const received = Number(agg._sum.amount ?? 0);
      const debt = Math.max(0, expected - received);

      let status: "PAID" | "PARTIAL" | "OVERDUE" | "PENDING";
      if (received >= expected) {
        status = "PAID";
      } else if (isOverdueEligible) {
        status = received > 0 ? "PARTIAL" : "OVERDUE";
      } else {
        status = received > 0 ? "PARTIAL" : "PENDING";
      }

      await prisma.paymentPeriod.upsert({
        where: {
          organizationId_year_month: {
            organizationId: org.id,
            year: targetYear,
            month: targetMonth,
          },
        },
        update: { expected, received, debtAmount: debt, status },
        create: {
          organizationId: org.id,
          year: targetYear,
          month: targetMonth,
          expected,
          received,
          debtAmount: debt,
          status,
        },
      });
      updated++;
    }

    // Update debtAmount on organizations based on total unpaid
    for (const org of orgs) {
      const debtAgg = await prisma.paymentPeriod.aggregate({
        where: {
          organizationId: org.id,
          status: { in: ["OVERDUE", "PARTIAL"] },
        },
        _sum: { debtAmount: true },
      });
      await prisma.organization.update({
        where: { id: org.id },
        data: { debtAmount: Number(debtAgg._sum.debtAmount ?? 0) },
      });
    }

    res.json({ updated, year: targetYear, month: targetMonth });
  } catch (err) {
    console.error("Reconcile error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/payments/reconciliation — view payment periods
router.get(
  "/reconciliation",
  authenticate,
  requireRole("admin", "supervisor"),
  async (req, res) => {
    try {
      const { year, month, status, page: pageQ, limit: limitQ } = req.query;
      const page = Math.max(1, Number(pageQ) || 1);
      const limit = Math.min(100, Math.max(1, Number(limitQ) || 50));
      const skip = (page - 1) * limit;

      const where: Prisma.PaymentPeriodWhereInput = {};
      if (year) where.year = Number(year);
      if (month) where.month = Number(month);
      if (status) where.status = String(status) as Prisma.EnumPaymentPeriodStatusFilter["equals"];

      const [periods, total] = await Promise.all([
        prisma.paymentPeriod.findMany({
          where,
          orderBy: [{ year: "desc" }, { month: "desc" }, { status: "asc" }],
          skip,
          take: limit,
          include: {
            organization: {
              select: { id: true, name: true, inn: true, monthlyPayment: true },
            },
          },
        }),
        prisma.paymentPeriod.count({ where }),
      ]);

      // Summary
      const summary = await prisma.paymentPeriod.aggregate({
        where,
        _sum: { expected: true, received: true, debtAmount: true },
      });

      res.json({
        periods,
        total,
        page,
        limit,
        summary: {
          expected: Number(summary._sum.expected ?? 0),
          received: Number(summary._sum.received ?? 0),
          debt: Number(summary._sum.debtAmount ?? 0),
        },
      });
    } catch (err) {
      console.error("Reconciliation error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// GET /api/payments/summary — monthly totals
router.get("/summary", authenticate, requireRole("admin", "supervisor"), async (req, res) => {
  try {
    const targetYear = Number(req.query.year) || new Date().getFullYear();

    const months = [];
    for (let m = 1; m <= 12; m++) {
      const agg = await prisma.bankTransaction.aggregate({
        where: {
          matchStatus: { in: ["AUTO", "MANUAL"] },
          date: {
            gte: new Date(targetYear, m - 1, 1),
            lt: new Date(targetYear, m, 1),
          },
        },
        _sum: { amount: true },
        _count: true,
      });
      months.push({
        month: m,
        total: Number(agg._sum.amount ?? 0),
        count: agg._count,
      });
    }

    res.json({ year: targetYear, months });
  } catch (err) {
    console.error("Payment summary error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
