import { Router } from "express";
import dashboardRouter from "./dashboard.js";
import expensesRouter from "./expenses.js";
import incomesRouter from "./incomes.js";
import analyticsRouter from "./analytics.js";

// Монолитный routes/management.ts разбит на под-роутеры по доменам.
// Все пути объявлены полностью (от корня /api/management) — префиксы модулей
// статически различимы, конфликтов матчинга нет. Порядок монтирования
// повторяет порядок объявления роутов в исходном файле.
const router = Router();

router.use(dashboardRouter);
router.use(expensesRouter);
router.use(incomesRouter);
router.use(analyticsRouter);

export default router;
