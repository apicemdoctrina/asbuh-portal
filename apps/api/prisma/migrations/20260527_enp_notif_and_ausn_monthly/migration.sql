-- АУСН — расчёт: переводим в ежемесячный режим (расчёт ФНС присылает помесячно,
-- срок уплаты — 25-е число следующего месяца). Старые квартальные entries удаляем,
-- т.к. поле period после смены frequency не совместимо (1-4 → 1-12).
DELETE FROM "report_entries"
 WHERE "report_type_id" IN (SELECT "id" FROM "report_types" WHERE "code" = 'AUSN_CALC');

UPDATE "report_types"
   SET "frequency" = 'MONTHLY',
       "updated_at" = NOW()
 WHERE "code" = 'AUSN_CALC';

-- Ежемесячные уведомления об исчисленных суммах ЕНП.
INSERT INTO "report_types" ("id", "name", "code", "frequency", "order", "is_active", "deadline_day", "deadline_month_offset", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'Уведомление ЕНП (до 25-го)', 'ENP_NOTIF_25', 'MONTHLY', 17, TRUE, 25, 0, NOW(), NOW()),
  (gen_random_uuid(), 'Уведомление ЕНП (до 3-го)',  'ENP_NOTIF_3',  'MONTHLY', 18, TRUE,  3, 1, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
