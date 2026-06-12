import { Router } from "express";
import prisma from "../../lib/prisma.js";
import { authenticate, requireRole } from "../../middleware/auth.js";

const router = Router();

// ─── Expenses CRUD ────────────────────────────────────────────────────────────

// GET /api/management/expenses
router.get("/expenses", authenticate, requireRole("admin", "supervisor"), async (_req, res) => {
  try {
    const expenses = await prisma.expense.findMany({
      orderBy: [{ type: "asc" }, { createdAt: "asc" }],
    });
    res.json(expenses);
  } catch (err) {
    console.error("Expenses list error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/management/expenses
router.post("/expenses", authenticate, requireRole("admin", "supervisor"), async (req, res) => {
  try {
    const { name, amount, type, date, description } = req.body;
    if (!name || amount == null || !type) {
      res.status(400).json({ error: "name, amount, type are required" });
      return;
    }
    if (!["RECURRING", "ONE_TIME"].includes(type)) {
      res.status(400).json({ error: "Invalid type" });
      return;
    }
    const expense = await prisma.expense.create({
      data: {
        name: String(name),
        amount: String(amount),
        type,
        date: date ? new Date(date) : null,
        description: description ? String(description) : null,
      },
    });
    res.status(201).json(expense);
  } catch (err) {
    console.error("Create expense error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/management/expenses/:id
router.put("/expenses/:id", authenticate, requireRole("admin", "supervisor"), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, amount, type, date, description } = req.body;

    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (type !== undefined && !["RECURRING", "ONE_TIME"].includes(type)) {
      res.status(400).json({ error: "Invalid type" });
      return;
    }
    const expense = await prisma.expense.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: String(name) }),
        ...(amount !== undefined && { amount: String(amount) }),
        ...(type !== undefined && { type }),
        ...(date !== undefined && { date: date ? new Date(date) : null }),
        ...(description !== undefined && {
          description: description ? String(description) : null,
        }),
      },
    });
    res.json(expense);
  } catch (err) {
    console.error("Update expense error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/management/expenses/:id
router.delete(
  "/expenses/:id",
  authenticate,
  requireRole("admin", "supervisor"),
  async (req, res) => {
    try {
      const { id } = req.params;
      await prisma.expense.delete({ where: { id } });
      res.status(204).send();
    } catch (err) {
      console.error("Delete expense error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
