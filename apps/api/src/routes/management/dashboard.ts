import { Router } from "express";
import prisma from "../../lib/prisma.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { computeCurrentMetrics, saveSnapshot } from "./helpers.js";

const router = Router();

// GET /api/management/dashboard
// GET /api/management/bank-stats — статистика по банкам клиентов
router.get("/bank-stats", authenticate, requireRole("admin", "supervisor"), async (_req, res) => {
  try {
    const accounts = await prisma.organizationBankAccount.findMany({
      select: {
        bankName: true,
        apiProvider: true,
        apiToken: true,
        autoFetchEnabled: true,
        organizationId: true,
        organization: { select: { id: true, name: true } },
      },
    });

    // По банкам: количество счетов / уникальных орг + подключено к API / авто-выгрузка.
    const byBank = new Map<
      string,
      {
        bankName: string;
        accounts: number;
        organizations: Set<string>;
        apiConnected: number;
        autoFetch: number;
      }
    >();
    for (const a of accounts) {
      const k = a.bankName || "—";
      if (!byBank.has(k)) {
        byBank.set(k, {
          bankName: k,
          accounts: 0,
          organizations: new Set(),
          apiConnected: 0,
          autoFetch: 0,
        });
      }
      const row = byBank.get(k)!;
      row.accounts++;
      row.organizations.add(a.organizationId);
      if (a.apiProvider && a.apiToken) row.apiConnected++;
      if (a.autoFetchEnabled) row.autoFetch++;
    }

    const banks = Array.from(byBank.values())
      .map((r) => ({
        bankName: r.bankName,
        accounts: r.accounts,
        organizations: r.organizations.size,
        apiConnected: r.apiConnected,
        autoFetch: r.autoFetch,
      }))
      .sort((a, b) => b.accounts - a.accounts);

    const totals = {
      accounts: accounts.length,
      organizations: new Set(accounts.map((a) => a.organizationId)).size,
      apiConnected: accounts.filter((a) => a.apiProvider && a.apiToken).length,
      autoFetch: accounts.filter((a) => a.autoFetchEnabled).length,
    };

    res.json({ totals, banks });
  } catch (err) {
    console.error("Bank stats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/dashboard", authenticate, requireRole("admin", "supervisor"), async (_req, res) => {
  try {
    const metrics = await computeCurrentMetrics();
    res.json(metrics);
    // Auto-capture snapshot in background (fire-and-forget)
    saveSnapshot(metrics).catch((err) => console.error("Auto-snapshot error:", err));
  } catch (err) {
    console.error("Management dashboard error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/management/snapshots/capture — manual refresh
router.post(
  "/snapshots/capture",
  authenticate,
  requireRole("admin", "supervisor"),
  async (_req, res) => {
    try {
      const metrics = await computeCurrentMetrics();
      const snapshot = await saveSnapshot(metrics);
      res.json(snapshot);
    } catch (err) {
      console.error("Snapshot capture error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// GET /api/management/snapshots — last 24 months chronological
router.get("/snapshots", authenticate, requireRole("admin", "supervisor"), async (_req, res) => {
  try {
    const snapshots = await prisma.revenueSnapshot.findMany({
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 24,
    });
    res.json(snapshots.reverse());
  } catch (err) {
    console.error("Snapshots error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
