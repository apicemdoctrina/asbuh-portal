import { Router } from "express";
import prisma from "../../lib/prisma.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { logAudit } from "../../lib/audit.js";
import {
  TOCHKA_TOKEN,
  fetchTochkaTransactions,
  importTochkaIncoming,
  autoMatchTransactions,
} from "../../lib/tochka-sync.js";

const router = Router();

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

export default router;
