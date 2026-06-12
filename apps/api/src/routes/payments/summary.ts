import { Router } from "express";
import prisma from "../../lib/prisma.js";
import { authenticate, requireRole } from "../../middleware/auth.js";

const router = Router();

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

export default router;
