import { Router } from "express";
import prisma from "../lib/prisma.js";
import { Prisma } from "@prisma/client";
import { authenticate, requireRole } from "../middleware/auth.js";
import { logAudit } from "../lib/audit.js";
import {
  DEBT_BASE_DATE,
  MANUAL_BASE_DATE,
  calcExpected,
  recalcOrgDebt,
  ORG_EXPECTED_SELECT,
} from "../lib/debt.js";
import {
  TOCHKA_TOKEN,
  tochkaFetch,
  fetchTochkaTransactions,
  importTochkaIncoming,
  autoMatchTransactions,
} from "../lib/tochka-sync.js";

const router = Router();

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
    const { bankName, accountNumber } = req.body;
    if (!bankName || !accountNumber) {
      res.status(400).json({ error: "bankName and accountNumber are required" });
      return;
    }
    const account = await prisma.bankAccount.create({
      data: { bankName, accountNumber },
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

// PUT /api/payments/accounts/:id — update account
router.put("/accounts/:id", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { isActive, bankName, accountNumber } = req.body;
    const data: Prisma.BankAccountUpdateInput = {};
    if (isActive !== undefined) data.isActive = isActive;
    if (bankName !== undefined) data.bankName = bankName;
    if (accountNumber !== undefined) data.accountNumber = accountNumber;

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

// GET /api/payments/tochka-accounts — fetch accounts directly from Tochka API
router.get("/tochka-accounts", authenticate, requireRole("admin"), async (_req, res) => {
  try {
    if (!TOCHKA_TOKEN) {
      res.status(400).json({ error: "TOCHKA_JWT_TOKEN not configured" });
      return;
    }
    const apiRes = await tochkaFetch("/accounts");
    if (!apiRes.ok) {
      const err = await apiRes.text();
      res.status(502).json({ error: "Tochka API error", details: err });
      return;
    }
    const data = await apiRes.json();
    const accounts = data?.Data?.Account || [];
    res.json(
      accounts.map(
        (a: {
          accountId: string;
          status: string;
          currency: string;
          accountDetails?: { name?: string }[];
        }) => ({
          accountId: a.accountId,
          status: a.status,
          currency: a.currency,
          name: a.accountDetails?.[0]?.name || "Счёт в Точке",
        }),
      ),
    );
  } catch (err) {
    console.error("Tochka accounts error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Sync transactions from bank ─────────────────────────────────────────────

// POST /api/payments/sync — fetch new transactions from Tochka
router.post("/sync", authenticate, requireRole("admin", "supervisor"), async (req, res) => {
  try {
    if (!TOCHKA_TOKEN) {
      res.status(400).json({ error: "TOCHKA_JWT_TOKEN not configured" });
      return;
    }

    const { accountId, dateFrom, dateTo } = req.body;
    const account = await prisma.bankAccount.findUnique({ where: { id: accountId } });
    if (!account) {
      res.status(400).json({ error: "Bank account not found" });
      return;
    }

    const from = dateFrom || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const to = dateTo || new Date().toISOString().slice(0, 10);

    // Fetch transactions from Tochka via statement API
    const allTx = await fetchTochkaTransactions(account.accountNumber, from, to);

    // Import incoming (Credit, без депозитных возвратов) + auto-matching
    const { imported, skipped, incoming, depositReturns } = await importTochkaIncoming(
      account.id,
      allTx,
    );
    const matched = await autoMatchTransactions();

    await logAudit({
      action: "bank_sync",
      userId: req.user!.userId,
      entity: "bank_account",
      entityId: account.id,
      details: {
        from,
        to,
        imported,
        skipped,
        matched,
        totalFromBank: allTx.length,
        incoming,
        depositReturns,
      },
      ipAddress: req.ip,
    });

    res.json({ imported, skipped, matched });
  } catch (err) {
    console.error("Sync error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});

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

// ─── Reconciliation ──────────────────────────────────────────────────────────

// POST /api/payments/reconcile — recalculate payment periods
// Accepts month as number (single month) or "all" (whole year)
// Handles: serviceStartDate, price history, payment frequency, group payments
router.post("/reconcile", authenticate, requireRole("admin", "supervisor"), async (req, res) => {
  try {
    // Only orgs that pay via bank
    const orgs = await prisma.organization.findMany({
      where: {
        paymentDestination: "BANK_TOCHKA",
        monthlyPayment: { not: null, gt: 0 },
        status: {
          notIn: ["left", "closed", "not_paying", "ceased", "own", "blacklisted", "archived"],
        },
      },
      select: {
        id: true,
        name: true,
        monthlyPayment: true,
        serviceStartDate: true,
        clientGroupId: true,
        clientGroup: { select: { id: true, name: true } },
        sectionId: true,
        section: { select: { id: true, name: true } },
        paymentNote: true,
        paymentDestination: true,
        priceHistory: {
          select: { price: true, effectiveFrom: true },
          orderBy: { effectiveFrom: "asc" as const },
        },
      },
    });

    // Collect all unique group IDs from paying orgs
    const groupIds = [...new Set(orgs.filter((o) => o.clientGroupId).map((o) => o.clientGroupId!))];

    // Fetch ALL orgs in those groups (including non-paying ones)
    const allGroupOrgs =
      groupIds.length > 0
        ? await prisma.organization.findMany({
            where: { clientGroupId: { in: groupIds } },
            select: {
              id: true,
              name: true,
              monthlyPayment: true,
              serviceStartDate: true,
              clientGroupId: true,
              clientGroup: { select: { id: true, name: true } },
              sectionId: true,
              section: { select: { id: true, name: true } },
              paymentNote: true,
              paymentDestination: true,
              status: true,
              priceHistory: {
                select: { price: true, effectiveFrom: true },
                orderBy: { effectiveFrom: "asc" },
              },
            },
          })
        : [];

    // One groupBy instead of an aggregate per org/group — N orgs → 1 query
    const relevantOrgIds = [
      ...orgs.filter((o) => !o.clientGroupId).map((o) => o.id),
      ...allGroupOrgs.filter((o) => o.paymentDestination === "BANK_TOCHKA").map((o) => o.id),
    ];
    const sums = relevantOrgIds.length
      ? await prisma.bankTransaction.groupBy({
          by: ["organizationId"],
          where: {
            organizationId: { in: relevantOrgIds },
            matchStatus: { in: ["AUTO", "MANUAL"] },
            date: { gte: DEBT_BASE_DATE },
          },
          _sum: { amount: true },
        })
      : [];
    const receivedByOrg = new Map(
      sums.map((s) => [s.organizationId as string, Number(s._sum.amount ?? 0)]),
    );

    const processedGroups = new Set<string>();
    const results: Array<{
      orgId: string;
      orgName: string;
      groupId: string | null;
      groupName: string | null;
      sectionId: string | null;
      sectionName: string | null;
      expected: number;
      received: number;
      debt: number;
      groupDebt?: number;
      groupExpected?: number;
      groupReceived?: number;
      paymentNote: string | null;
    }> = [];

    for (const org of orgs) {
      // Group org: handle at group level
      if (org.clientGroupId) {
        if (processedGroups.has(org.clientGroupId)) continue;
        processedGroups.add(org.clientGroupId);

        const groupMembers = allGroupOrgs.filter((o) => o.clientGroupId === org.clientGroupId);
        // Only bank-paying members count toward group debt
        const bankMembers = groupMembers.filter((o) => o.paymentDestination === "BANK_TOCHKA");
        const bankMemberIds = bankMembers.map((o) => o.id);

        // Group-level totals (only bank-paying orgs)
        const groupExpected = bankMembers.reduce((s, o) => s + calcExpected(o), 0);
        const groupReceived = bankMemberIds.reduce((s, id) => s + (receivedByOrg.get(id) ?? 0), 0);
        const groupDebt = Math.max(0, groupExpected - groupReceived);

        for (const gOrg of groupMembers) {
          const isBankPayer = gOrg.paymentDestination === "BANK_TOCHKA";
          results.push({
            orgId: gOrg.id,
            orgName: gOrg.name,
            groupId: org.clientGroupId,
            groupName: org.clientGroup?.name || null,
            sectionId: gOrg.sectionId || null,
            sectionName: gOrg.section?.name || null,
            expected: isBankPayer ? calcExpected(gOrg) : 0,
            received: 0,
            debt: 0,
            groupDebt,
            groupExpected,
            groupReceived,
            paymentNote: gOrg.paymentNote,
          });
        }
        continue;
      }

      // Non-group org
      const expected = calcExpected(org);
      const received = receivedByOrg.get(org.id) ?? 0;
      const debt = Math.max(0, expected - received);

      results.push({
        orgId: org.id,
        orgName: org.name,
        groupId: null,
        groupName: null,
        sectionId: org.sectionId || null,
        sectionName: org.section?.name || null,
        expected,
        received,
        debt,
        paymentNote: org.paymentNote,
      });
    }

    // Final debt per org: grouped orgs get 0, flagship carries the group debt
    const debtByOrg = new Map<string, number>();
    for (const r of results) debtByOrg.set(r.orgId, r.groupId ? 0 : r.debt);
    // Assign group debt to flagship (highest monthlyPayment) per group
    const groupFlagships = new Map<string, { id: string; payment: number; debt: number }>();
    for (const r of results) {
      if (!r.groupId) continue;
      const payment = Number(orgs.find((o) => o.id === r.orgId)?.monthlyPayment ?? 0);
      const cur = groupFlagships.get(r.groupId);
      if (!cur || payment > cur.payment) {
        groupFlagships.set(r.groupId, { id: r.orgId, payment, debt: r.groupDebt ?? 0 });
      }
    }
    for (const f of groupFlagships.values()) {
      if (f.debt > 0) debtByOrg.set(f.id, f.debt);
    }

    // Batch the writes atomically: zeroes via one updateMany, the rest individually.
    // A crash mid-recalc can no longer leave debts half-updated.
    const zeroIds = [...debtByOrg].filter(([, d]) => d === 0).map(([id]) => id);
    const nonZero = [...debtByOrg].filter(([, d]) => d !== 0);
    await prisma.$transaction([
      ...(zeroIds.length
        ? [
            prisma.organization.updateMany({
              where: { id: { in: zeroIds } },
              data: { debtAmount: 0 },
            }),
          ]
        : []),
      ...nonZero.map(([id, debt]) =>
        prisma.organization.update({ where: { id }, data: { debtAmount: debt } }),
      ),
      // Zero out debt for orgs that no longer pay via bank
      prisma.organization.updateMany({
        where: {
          paymentDestination: { not: "BANK_TOCHKA" },
          debtAmount: { gt: 0 },
        },
        data: { debtAmount: 0 },
      }),
    ]);

    // Calculate totals: count group debt once per group
    const countedGroups = new Set<string>();
    let totalExpected = 0;
    let totalReceived = 0;
    let totalDebt = 0;
    let debtorCount = 0;
    for (const r of results) {
      if (r.groupId) {
        if (!countedGroups.has(r.groupId)) {
          countedGroups.add(r.groupId);
          totalExpected += r.groupExpected ?? 0;
          totalReceived += r.groupReceived ?? 0;
          totalDebt += r.groupDebt ?? 0;
          if ((r.groupDebt ?? 0) > 0) debtorCount++;
        }
      } else {
        totalExpected += r.expected;
        totalReceived += r.received;
        totalDebt += r.debt;
        if (r.debt > 0) debtorCount++;
      }
    }

    res.json({
      orgCount: results.length,
      totalExpected,
      totalReceived,
      totalDebt,
      debtorCount,
      results,
    });
  } catch (err) {
    console.error("Reconcile error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/payments/reconcile-manual — reconciliation for CARD/CASH orgs
router.post(
  "/reconcile-manual",
  authenticate,
  requireRole("admin", "supervisor"),
  async (req, res) => {
    try {
      const orgs = await prisma.organization.findMany({
        where: {
          paymentDestination: { in: ["CARD", "CASH"] },
          monthlyPayment: { not: null, gt: 0 },
          status: {
            notIn: ["left", "closed", "not_paying", "ceased", "own", "blacklisted", "archived"],
          },
        },
        select: {
          id: true,
          name: true,
          monthlyPayment: true,
          serviceStartDate: true,
          paymentDestination: true,
          paymentNote: true,
          sectionId: true,
          section: { select: { id: true, name: true } },
          priceHistory: {
            select: { price: true, effectiveFrom: true },
            orderBy: { effectiveFrom: "asc" as const },
          },
        },
      });

      const results = [];
      let totalExpected = 0;
      let totalReceived = 0;
      let totalDebt = 0;
      let debtorCount = 0;

      for (const org of orgs) {
        const expected = calcExpected(org, MANUAL_BASE_DATE);

        // Sum manual transactions linked to this org
        const agg = await prisma.bankTransaction.aggregate({
          where: {
            organizationId: org.id,
            isManual: true,
            matchStatus: { in: ["AUTO", "MANUAL"] },
            date: { gte: MANUAL_BASE_DATE },
          },
          _sum: { amount: true },
        });
        const received = Number(agg._sum.amount ?? 0);
        const debt = Math.max(0, expected - received);

        totalExpected += expected;
        totalReceived += received;
        totalDebt += debt;
        if (debt > 0) debtorCount++;

        results.push({
          orgId: org.id,
          orgName: org.name,
          paymentDestination: org.paymentDestination,
          sectionId: org.sectionId || null,
          sectionName: org.section?.name || null,
          expected,
          received,
          debt,
          paymentNote: org.paymentNote,
        });
      }

      res.json({
        orgCount: results.length,
        totalExpected,
        totalReceived,
        totalDebt,
        debtorCount,
        results,
      });
    } catch (err) {
      console.error("Reconcile-manual error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// POST /api/payments/write-off — create correction transaction to zero out balance
router.post("/write-off", authenticate, requireRole("admin", "supervisor"), async (req, res) => {
  try {
    const { organizationId, groupId } = req.body;
    if (!organizationId && !groupId) {
      res.status(400).json({ error: "organizationId or groupId required" });
      return;
    }

    // For grouped orgs: calculate group-level balance
    if (groupId) {
      const groupOrgs = await prisma.organization.findMany({
        where: { clientGroupId: groupId },
        select: {
          ...ORG_EXPECTED_SELECT,
          id: true,
          name: true,
        },
      });
      const bankMembers = groupOrgs.filter((o) => o.paymentDestination === "BANK_TOCHKA");
      const bankMemberIds = bankMembers.map((o) => o.id);
      const groupExpected = bankMembers.reduce((s, o) => s + calcExpected(o), 0);
      const agg = await prisma.bankTransaction.aggregate({
        where: {
          organizationId: { in: bankMemberIds },
          matchStatus: { in: ["AUTO", "MANUAL"] },
          date: { gte: DEBT_BASE_DATE },
        },
        _sum: { amount: true },
      });
      const groupReceived = Number(agg._sum.amount ?? 0);
      const diff = groupExpected - groupReceived; // positive = debt, negative = overpayment

      if (diff === 0) {
        res.json({ message: "Баланс уже нулевой", correction: 0 });
        return;
      }

      // Pick flagship (highest monthlyPayment) to attach the correction
      const flagship = bankMembers.reduce((best, o) =>
        Number(o.monthlyPayment ?? 0) > Number(best.monthlyPayment ?? 0) ? o : best,
      );

      const tx = await prisma.bankTransaction.create({
        data: {
          date: new Date(),
          amount: new Prisma.Decimal(Math.abs(diff)),
          organizationId: flagship.id,
          payerName:
            diff > 0 ? "Взаимозачёт — списание долга" : "Взаимозачёт — корректировка переплаты",
          purpose: `Корректировка баланса группы: ${diff > 0 ? "+" : "-"}${Math.abs(diff)} ₽`,
          isManual: true,
          matchStatus: "MANUAL",
          matchedAt: new Date(),
          matchedBy: req.user!.userId,
        },
      });

      // If overpayment: we created a positive tx to match expected, but we need negative.
      // Actually: if diff > 0 (debt), we add +diff to increase received.
      // If diff < 0 (overpaid), we need to reduce received, so create negative amount.
      if (diff < 0) {
        await prisma.bankTransaction.update({
          where: { id: tx.id },
          data: { amount: new Prisma.Decimal(diff) }, // negative
        });
      }

      // Recalc debt for all group members
      for (const o of groupOrgs) {
        await recalcOrgDebt(o.id);
      }

      await logAudit({
        action: "payment_write_off",
        userId: req.user!.userId,
        entity: "client_group",
        entityId: groupId,
        details: { correction: diff, flagshipId: flagship.id },
      });

      res.json({ message: "Взаимозачёт выполнен", correction: diff, transactionId: tx.id });
      return;
    }

    // Single org
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: ORG_EXPECTED_SELECT,
    });
    if (!org) {
      res.status(404).json({ error: "Организация не найдена" });
      return;
    }

    const baseDate = org.paymentDestination === "BANK_TOCHKA" ? DEBT_BASE_DATE : MANUAL_BASE_DATE;
    const expected = calcExpected(org, baseDate);
    const agg = await prisma.bankTransaction.aggregate({
      where: {
        organizationId,
        matchStatus: { in: ["AUTO", "MANUAL"] },
        date: { gte: baseDate },
      },
      _sum: { amount: true },
    });
    const received = Number(agg._sum.amount ?? 0);
    const diff = expected - received;

    if (diff === 0) {
      res.json({ message: "Баланс уже нулевой", correction: 0 });
      return;
    }

    await prisma.bankTransaction.create({
      data: {
        date: new Date(),
        amount: new Prisma.Decimal(diff), // positive = covers debt, negative = removes overpayment
        organizationId,
        payerName:
          diff > 0 ? "Взаимозачёт — списание долга" : "Взаимозачёт — корректировка переплаты",
        purpose: `Корректировка баланса: ${diff > 0 ? "+" : ""}${diff} ₽`,
        isManual: true,
        matchStatus: "MANUAL",
        matchedAt: new Date(),
        matchedBy: req.user!.userId,
      },
    });

    await recalcOrgDebt(organizationId);

    await logAudit({
      action: "payment_write_off",
      userId: req.user!.userId,
      entity: "organization",
      entityId: organizationId,
      details: { correction: diff, expected, received },
    });

    res.json({ message: "Взаимозачёт выполнен", correction: diff });
  } catch (err) {
    console.error("Write-off error:", err);
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

// PUT /api/payments/org/:orgId/note — update payment note
router.put(
  "/org/:orgId/note",
  authenticate,
  requireRole("admin", "supervisor"),
  async (req, res) => {
    try {
      const { note } = req.body;
      await prisma.organization.update({
        where: { id: req.params.orgId },
        data: { paymentNote: note || null },
      });
      res.json({ success: true });
    } catch (err) {
      console.error("Update payment note error:", err);
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

// GET /api/payments/summary — monthly totals
router.get("/summary", authenticate, requireRole("admin", "supervisor"), async (req, res) => {
  try {
    const yearParam = req.query.year as string | undefined;
    const isAll = yearParam === "all";
    const targetYear = isAll ? null : Number(yearParam) || new Date().getFullYear();

    if (isAll) {
      // Return monthly totals from 2025-01 to current month
      const startYear = 2025;
      const now = new Date();
      const endYear = now.getFullYear();
      const endMonth = now.getMonth() + 1;
      const months = [];

      for (let y = startYear; y <= endYear; y++) {
        const lastMonth = y === endYear ? endMonth : 12;
        for (let m = 1; m <= lastMonth; m++) {
          const agg = await prisma.bankTransaction.aggregate({
            where: {
              matchStatus: { in: ["AUTO", "MANUAL"] },
              date: {
                gte: new Date(y, m - 1, 1),
                lt: new Date(y, m, 1),
              },
            },
            _sum: { amount: true },
            _count: true,
          });
          months.push({
            year: y,
            month: m,
            total: Number(agg._sum.amount ?? 0),
            count: agg._count,
          });
        }
      }

      res.json({ year: "all", months });
    } else {
      const months = [];
      for (let m = 1; m <= 12; m++) {
        const agg = await prisma.bankTransaction.aggregate({
          where: {
            matchStatus: { in: ["AUTO", "MANUAL"] },
            date: {
              gte: new Date(targetYear!, m - 1, 1),
              lt: new Date(targetYear!, m, 1),
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
    }
  } catch (err) {
    console.error("Payment summary error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Staff endpoints (accountant / manager) ────────────────────────────────

/** Get org IDs belonging to the user's sections */
async function getStaffOrgIds(userId: string): Promise<string[]> {
  const sections = await prisma.sectionMember.findMany({
    where: { userId },
    select: { sectionId: true },
  });
  if (sections.length === 0) return [];
  const orgs = await prisma.organization.findMany({
    where: { sectionId: { in: sections.map((s) => s.sectionId) } },
    select: { id: true },
  });
  return orgs.map((o) => o.id);
}

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
