import { Router } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../../lib/prisma.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { logAudit } from "../../lib/audit.js";
import {
  DEBT_BASE_DATE,
  MANUAL_BASE_DATE,
  NON_PAYING_STATUSES,
  calcExpected,
  recalcOrgDebt,
  ORG_EXPECTED_SELECT,
} from "../../lib/debt.js";

const router = Router();

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
        status: { notIn: [...NON_PAYING_STATUSES] },
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
          status: { notIn: [...NON_PAYING_STATUSES] },
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

export default router;
