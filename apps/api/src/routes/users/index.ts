import { Router } from "express";
import listRouter from "./list.js";
import meRouter from "./me.js";
import notificationPrefsRouter from "./notification-prefs.js";
import adminRouter from "./admin.js";

// Монолитный routes/users.ts разбит на под-роутеры по доменам.
// Все пути объявлены полностью (от корня /api/users).
//
// ВАЖЕН ПОРЯДОК МОНТИРОВАНИЯ: статические /me-роуты (me, notification-prefs)
// обязаны матчиться раньше параметризованных /:id-роутов (admin), иначе
// GET /me попадёт в GET /:id (admin-only) и PATCH /me/password — в
// PATCH /:id/password. Порядок повторяет порядок объявления в исходном файле:
// GET / → /me-профиль → /me/notification-preferences → /:id-админка.
const router = Router();

router.use(listRouter);
router.use(meRouter);
router.use(notificationPrefsRouter);
router.use(adminRouter);

export default router;
