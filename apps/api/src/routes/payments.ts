import { Router } from "express";
import prisma from "../lib/prisma.js";
import { Prisma } from "@prisma/client";
import { authenticate, requireRole } from "../middleware/auth.js";
import { logAudit } from "../lib/audit.js";

const router = Router();

// ─── Tochka Bank Open Banking API helpers ────────────────────────────────────

const TOCHKA_API_BASE = "https://enter.tochka.com/uapi/open-banking/v1.0";
const TOCHKA_TOKEN = process.env.TOCHKA_JWT_TOKEN || "";

async function tochkaFetch(path: string, opts?: RequestInit): Promise<Response> {
  return fetch(`${TOCHKA_API_BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${TOCHKA_TOKEN}`,
      "Content-Type": "application/json",
      ...opts?.headers,
    },
  });
}

/** Create a statement request and poll until ready. Returns transactions array. */
async function fetchTochkaTransactions(
  accountId: string,
  startDate: string,
  endDate: string,
): Promise<TochkaTransaction[]> {
  // 1. Create statement
  const createRes = await tochkaFetch("/statements", {
    method: "POST",
    body: JSON.stringify({
      Data: {
        Statement: {
          accountId,
          startDateTime: startDate,
          endDateTime: endDate,
        },
      },
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Tochka create statement error ${createRes.status}: ${err}`);
  }

  const createData = await createRes.json();
  const statementId = createData?.Data?.Statement?.statementId;
  if (!statementId) throw new Error("No statementId in response");

  // 2. Poll until Ready (max 60 seconds)
  const encodedAccId = encodeURIComponent(accountId);
  const pollPath = `/accounts/${encodedAccId}/statements/${statementId}`;

  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((r) => setTimeout(r, 3000));

    const pollRes = await tochkaFetch(pollPath);
    if (!pollRes.ok) continue;

    const pollData = await pollRes.json();
    const stmts = pollData?.Data?.Statement;
    if (!Array.isArray(stmts) || stmts.length === 0) continue;

    const stmt = stmts[0];
    if (stmt.status === "Error") throw new Error("Statement generation failed");
    if (stmt.status === "Ready" || stmt.status === "Complete") {
      return (stmt.Transaction || []) as TochkaTransaction[];
    }
  }

  throw new Error("Statement polling timed out");
}

interface TochkaTransaction {
  transactionId: string;
  paymentId?: string;
  creditDebitIndicator: "Credit" | "Debit";
  status: string;
  documentNumber?: string;
  documentProcessDate: string;
  description?: string;
  Amount: { amount: number; currency: string };
  DebtorParty?: { inn?: string; name?: string; kpp?: string };
  DebtorAccount?: { identification?: string };
  CreditorParty?: { inn?: string; name?: string; kpp?: string };
  CreditorAccount?: { identification?: string };
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

    // Filter only incoming payments (Credit), exclude deposit returns and deposit interest
    const DEPOSIT_KEYWORDS =
      /возврат.*депозит|депозит.*возврат|возврат.*размещ|размещ.*возврат|процент.*депозит|депозит.*процент|выплата.*процент.*по.*депозит|%.*депозит|депозитн/i;
    const incoming = allTx.filter(
      (tx) => tx.creditDebitIndicator === "Credit" && !DEPOSIT_KEYWORDS.test(tx.description || ""),
    );

    let imported = 0;
    let skipped = 0;
    let depositReturns = 0;

    // Count filtered deposit returns for audit
    const allCredit = allTx.filter((tx) => tx.creditDebitIndicator === "Credit");
    depositReturns = allCredit.length - incoming.length;

    for (const tx of incoming) {
      const externalId = tx.transactionId;

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
          date: new Date(tx.documentProcessDate),
          amount: Number(tx.Amount?.amount ?? 0),
          payerName: tx.DebtorParty?.name || null,
          payerInn: tx.DebtorParty?.inn || null,
          payerAccount: tx.DebtorAccount?.identification || null,
          purpose: tx.description || null,
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
      details: {
        from,
        to,
        imported,
        skipped,
        matched,
        totalFromBank: allTx.length,
        incoming: incoming.length,
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DEBT_BASE_DATE = new Date(2025, 0, 1);

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

interface OrgForExpected {
  monthlyPayment: unknown;
  serviceStartDate: Date | null;
  priceHistory: Array<{ price: unknown; effectiveFrom: Date }>;
}

function calcExpected(org: OrgForExpected): number {
  const now = new Date();
  const currentMonth1st = new Date(now.getFullYear(), now.getMonth(), 1);
  const start =
    org.serviceStartDate && org.serviceStartDate > DEBT_BASE_DATE
      ? monthStart(org.serviceStartDate)
      : DEBT_BASE_DATE;
  if (start >= currentMonth1st) return 0;

  const history = org.priceHistory;
  if (!history || history.length === 0) {
    return Number(org.monthlyPayment ?? 0) * monthsBetween(start, currentMonth1st);
  }

  let total = 0;
  for (let i = 0; i < history.length; i++) {
    const iStart = monthStart(history[i].effectiveFrom);
    const iEnd =
      i + 1 < history.length ? monthStart(history[i + 1].effectiveFrom) : currentMonth1st;
    const from = iStart < start ? start : iStart;
    const to = iEnd > currentMonth1st ? currentMonth1st : iEnd;
    const months = monthsBetween(from, to);
    if (months > 0) total += Number(history[i].price) * months;
  }
  return total;
}

const ORG_EXPECTED_SELECT = {
  id: true,
  monthlyPayment: true,
  serviceStartDate: true,
  clientGroupId: true,
  paymentDestination: true,
  priceHistory: {
    select: { price: true, effectiveFrom: true },
    orderBy: { effectiveFrom: "asc" as const },
  },
} as const;

// Recalculate debtAmount for a single org after transaction status change
async function recalcOrgDebt(orgId: string): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: ORG_EXPECTED_SELECT,
  });
  if (!org) return;

  // Non-bank orgs should have zero debt (they are tracked separately)
  if (org.paymentDestination !== "BANK_TOCHKA") {
    await prisma.organization.update({
      where: { id: orgId },
      data: { debtAmount: 0 },
    });
    return;
  }

  // If org is in a group, calculate group-level debt (same logic as reconciliation)
  if (org.clientGroupId) {
    const groupOrgs = await prisma.organization.findMany({
      where: { clientGroupId: org.clientGroupId },
      select: ORG_EXPECTED_SELECT,
    });
    const bankMembers = groupOrgs.filter((o) => o.paymentDestination === "BANK_TOCHKA");
    const bankMemberIds = bankMembers.map((o) => o.id);
    const groupExpected = bankMembers.reduce((s, o) => s + calcExpected(o), 0);
    const groupAgg = await prisma.bankTransaction.aggregate({
      where: {
        organizationId: { in: bankMemberIds },
        matchStatus: { in: ["AUTO", "MANUAL"] },
        date: { gte: DEBT_BASE_DATE },
      },
      _sum: { amount: true },
    });
    const groupReceived = Number(groupAgg._sum.amount ?? 0);
    const groupDebt = Math.max(0, groupExpected - groupReceived);
    // Store 0 per org — debt lives at group level
    for (const gOrg of groupOrgs) {
      await prisma.organization.update({
        where: { id: gOrg.id },
        data: { debtAmount: 0 },
      });
    }
    // Store group debt on the org with highest monthlyPayment for display in org list
    if (bankMembers.length > 0) {
      const flagship = bankMembers.reduce((best, o) =>
        Number(o.monthlyPayment ?? 0) > Number(best.monthlyPayment ?? 0) ? o : best,
      );
      await prisma.organization.update({
        where: { id: flagship.id },
        data: { debtAmount: groupDebt },
      });
    }
  } else {
    const expected = calcExpected(org);
    const agg = await prisma.bankTransaction.aggregate({
      where: {
        organizationId: orgId,
        matchStatus: { in: ["AUTO", "MANUAL"] },
        date: { gte: DEBT_BASE_DATE },
      },
      _sum: { amount: true },
    });
    const received = Number(agg._sum.amount ?? 0);
    const debt = Math.max(0, expected - received);
    await prisma.organization.update({
      where: { id: orgId },
      data: { debtAmount: debt },
    });
  }
}

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
router.get("/transactions", authenticate, requireRole("admin", "supervisor"), async (req, res) => {
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
    if (matchStatus)
      where.matchStatus = String(matchStatus) as Prisma.EnumTransactionMatchStatusFilter["equals"];
    if (organizationId) where.organizationId = String(organizationId);
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
});

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
        const groupAgg = await prisma.bankTransaction.aggregate({
          where: {
            organizationId: { in: bankMemberIds },
            matchStatus: { in: ["AUTO", "MANUAL"] },
            date: { gte: DEBT_BASE_DATE },
          },
          _sum: { amount: true },
        });
        const groupReceived = Number(groupAgg._sum.amount ?? 0);
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
      const agg = await prisma.bankTransaction.aggregate({
        where: {
          organizationId: org.id,
          matchStatus: { in: ["AUTO", "MANUAL"] },
          date: { gte: DEBT_BASE_DATE },
        },
        _sum: { amount: true },
      });
      const received = Number(agg._sum.amount ?? 0);
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

    // Update debtAmount on each organization
    // For grouped orgs: 0 for all, then flagship gets the group debt
    for (const r of results) {
      await prisma.organization.update({
        where: { id: r.orgId },
        data: { debtAmount: r.groupId ? 0 : r.debt },
      });
    }
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
      if (f.debt > 0) {
        await prisma.organization.update({
          where: { id: f.id },
          data: { debtAmount: f.debt },
        });
      }
    }

    // Zero out debt for orgs that no longer pay via bank
    await prisma.organization.updateMany({
      where: {
        paymentDestination: { not: "BANK_TOCHKA" },
        debtAmount: { gt: 0 },
      },
      data: { debtAmount: 0 },
    });

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
        const expected = calcExpected(org);

        // Sum manual transactions linked to this org
        const agg = await prisma.bankTransaction.aggregate({
          where: {
            organizationId: org.id,
            isManual: true,
            matchStatus: { in: ["AUTO", "MANUAL"] },
            date: { gte: DEBT_BASE_DATE },
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
  requireRole("admin", "supervisor"),
  async (req, res) => {
    try {
      const { date, amount, organizationId, payerName, purpose } = req.body;
      if (!date || amount == null || amount === "") {
        res.status(400).json({ error: "date and amount are required" });
        return;
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
  requireRole("admin", "supervisor"),
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
        details: `Staff manual: ${amount} for org ${organizationId}`,
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
