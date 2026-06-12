import { Router } from "express";
import uploadRouter from "./upload.js";
import manageRouter from "./manage.js";
import fetchRouter from "./fetch.js";
import oauthSberRouter from "./oauth-sber.js";
import oauthAlfaRouter from "./oauth-alfa.js";
import oauthTochkaRouter from "./oauth-tochka.js";

// Монолитный routes/statements.ts разбит на под-роутеры по доменам.
// Порядок монтирования повторяет порядок объявления роутов в исходном файле;
// конфликтов матчинга между модулями нет (пути различаются числом сегментов
// или методом).
const router = Router();

router.use(uploadRouter);
router.use(manageRouter);
router.use(fetchRouter);
router.use(oauthSberRouter);
router.use(oauthAlfaRouter);
router.use(oauthTochkaRouter);

export default router;
