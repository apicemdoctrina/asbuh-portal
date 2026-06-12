import { Router } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../../lib/prisma.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { logAudit } from "../../lib/audit.js";
import { TOCHKA_TOKEN, tochkaFetch } from "../../lib/tochka-sync.js";

const router = Router();

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

export default router;
