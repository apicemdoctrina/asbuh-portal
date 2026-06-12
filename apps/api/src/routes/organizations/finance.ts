import { Router } from "express";
import prisma from "../../lib/prisma.js";
import { summarize } from "../../lib/org-finance.js";
import { authenticate, requirePermission } from "../../middleware/auth.js";
import { orgViewScope } from "../../lib/scoping.js";

const router = Router();

const getViewScopeWhere = orgViewScope;

// GET /api/organizations/:id/finance — финансовая аналитика из выписок
router.get(
  "/:id/finance",
  authenticate,
  requirePermission("organization", "view"),
  async (req, res) => {
    try {
      const roles = req.user!.roles;
      const userId = req.user!.userId;
      const scope = getViewScopeWhere(userId, roles);
      const org = await prisma.organization.findFirst({
        where: { id: req.params.id, ...scope },
        select: { id: true, financeVisibleToClient: true },
      });
      if (!org) {
        res.status(404).json({ error: "Organization not found" });
        return;
      }

      // Гейт для клиента: только при включённой публикации
      const isClientOnly =
        roles.includes("client") &&
        !roles.some((r) => ["admin", "supervisor", "manager", "accountant"].includes(r));
      if (isClientOnly && !org.financeVisibleToClient) {
        res.status(403).json({ error: "Финансовая аналитика не опубликована" });
        return;
      }

      // Диапазон дат
      const parseDate = (v: unknown): Date | null | undefined => {
        if (!v) return null;
        const d = new Date(String(v));
        return Number.isNaN(d.getTime()) ? undefined : d;
      };
      const from = parseDate(req.query.from);
      const to = parseDate(req.query.to);
      if (from === undefined || to === undefined) {
        res.status(422).json({ error: "Некорректная дата" });
        return;
      }
      if (from && to && from > to) {
        res.status(422).json({ error: "Начало диапазона позже конца" });
        return;
      }

      const dateWhere =
        from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};
      const where = { organizationId: org.id, ...dateWhere };

      const page = Math.max(1, Number(req.query.page) || 1);
      // Default — отдаём ВСЕ транзакции выбранного периода, чтобы клиентский
      // фильтр в блоке «Операции» работал по полной выписке, а не по
      // первым 50 строкам. 50000 — защита от крайних случаев, обычная орга
      // не приближается даже к 1/10 этого.
      const limit = Math.min(50000, Math.max(1, Number(req.query.limit) || 50000));

      const [all, transactions] = await Promise.all([
        prisma.statementTransaction.findMany({
          where,
          select: {
            date: true,
            direction: true,
            amount: true,
            counterparty: true,
            counterpartyInn: true,
            opHash: true,
          },
        }),
        prisma.statementTransaction.findMany({
          where,
          orderBy: { date: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);

      const seenHashes = new Set<string>();
      const dedupedAll = all.filter((t) => {
        if (!t.opHash) return true; // старые строки без хэша — не трогаем
        if (seenHashes.has(t.opHash)) return false;
        seenHashes.add(t.opHash);
        return true;
      });

      // Тот же дедуп для отдаваемого списка операций — иначе в UI видим
      // дубликаты (одна операция из перекрывающихся выписок), а «Топ по расходу»
      // считается уже на deduped → цифры не сходятся.
      const seenHashesTx = new Set<string>();
      const transactionsDeduped = transactions.filter((t) => {
        if (!t.opHash) return true;
        if (seenHashesTx.has(t.opHash)) return false;
        seenHashesTx.add(t.opHash);
        return true;
      });

      const summary = summarize(
        dedupedAll.map((t) => ({
          date: t.date,
          direction: t.direction as "IN" | "OUT",
          amount: Number(t.amount),
          counterparty: t.counterparty,
          counterpartyInn: t.counterpartyInn,
        })),
      );

      res.json({
        summary,
        transactions: transactionsDeduped,
        total: dedupedAll.length,
        page,
        limit,
      });
    } catch (err) {
      console.error("Org finance error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
