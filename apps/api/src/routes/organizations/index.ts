import { Router } from "express";
import coreRouter from "./core.js";
import membersRouter from "./members.js";
import bankAccountsRouter from "./bank-accounts.js";
import systemAccessesRouter from "./system-accesses.js";
import contactsRouter from "./contacts.js";
import documentsRouter from "./documents.js";
import taskGenerationRouter from "./task-generation.js";
import priceHistoryRouter from "./price-history.js";
import financeRouter from "./finance.js";

// Монолитный routes/organizations.ts разбит на под-роутеры по доменам.
// Все пути объявлены полностью (от корня /api/organizations), mergeParams не нужен.
// Внутри members.ts bulk-роуты объявлены раньше /:id/members — порядок матчинга
// исходного файла сохранён.
const router = Router();

router.use(coreRouter);
router.use(membersRouter);
router.use(bankAccountsRouter);
router.use(systemAccessesRouter);
router.use(contactsRouter);
router.use(documentsRouter);
router.use(taskGenerationRouter);
router.use(priceHistoryRouter);
router.use(financeRouter);

export default router;
