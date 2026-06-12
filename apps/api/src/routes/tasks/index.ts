import { Router } from "express";
import crudRouter from "./crud.js";
import commentsRouter from "./comments.js";
import checklistRouter from "./checklist.js";

// Монолитный routes/tasks.ts разбит на под-роутеры по доменам.
// Все пути объявлены полностью (от корня /api/tasks). Порядок монтирования
// повторяет порядок объявления роутов в исходном файле: CRUD → комментарии →
// чек-листы. Конфликтов матчинга нет (GET /:id отсутствует, а PUT/DELETE /:id
// не пересекаются по методу+глубине с /:id/comments и /:id/checklist),
// но порядок сохранён 1:1 с монолитом.
const router = Router();

router.use(crudRouter);
router.use(commentsRouter);
router.use(checklistRouter);

export default router;
