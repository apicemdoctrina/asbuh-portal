import { Router } from "express";
import prisma from "../../lib/prisma.js";
import { authenticate, requireRole } from "../../middleware/auth.js";

const router = Router();

// ─── Income CRUD ──────────────────────────────────────────────────────────────

// GET /api/management/incomes
router.get("/incomes", authenticate, requireRole("admin", "supervisor"), async (_req, res) => {
  try {
    const incomes = await prisma.income.findMany({
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    res.json(incomes);
  } catch (err) {
    console.error("Incomes list error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/management/incomes
router.post("/incomes", authenticate, requireRole("admin", "supervisor"), async (req, res) => {
  try {
    const { name, amount, date, description } = req.body;
    if (!name || amount == null) {
      res.status(400).json({ error: "name and amount are required" });
      return;
    }
    const income = await prisma.income.create({
      data: {
        name: String(name),
        amount: String(amount),
        date: date ? new Date(date) : null,
        description: description ? String(description) : null,
      },
    });
    res.status(201).json(income);
  } catch (err) {
    console.error("Create income error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/management/incomes/:id
router.put("/incomes/:id", authenticate, requireRole("admin", "supervisor"), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, amount, date, description } = req.body;

    const existing = await prisma.income.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const income = await prisma.income.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: String(name) }),
        ...(amount !== undefined && { amount: String(amount) }),
        ...(date !== undefined && { date: date ? new Date(date) : null }),
        ...(description !== undefined && {
          description: description ? String(description) : null,
        }),
      },
    });
    res.json(income);
  } catch (err) {
    console.error("Update income error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/management/incomes/:id
router.delete(
  "/incomes/:id",
  authenticate,
  requireRole("admin", "supervisor"),
  async (req, res) => {
    try {
      const { id } = req.params;
      await prisma.income.delete({ where: { id } });
      res.status(204).send();
    } catch (err) {
      console.error("Delete income error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
