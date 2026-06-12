import { Router } from "express";
import accountsRouter from "./accounts.js";
import syncRouter from "./sync.js";
import transactionsRouter from "./transactions.js";
import reconcileRouter from "./reconcile.js";
import summaryRouter from "./summary.js";
import staffRouter from "./staff.js";

// Монолитный routes/payments.ts разбит на под-роутеры по доменам.
// Все пути объявлены полностью (от корня /api/payments) — префиксы модулей
// статически различимы, конфликтов матчинга нет.
const router = Router();

router.use(accountsRouter);
router.use(syncRouter);
router.use(transactionsRouter);
router.use(reconcileRouter);
router.use(summaryRouter);
router.use(staffRouter);

export default router;
