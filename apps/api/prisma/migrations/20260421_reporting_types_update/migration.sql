-- Remove obsolete USN_ADVANCE report type (FK cascade drops its report_entries)
DELETE FROM "report_types" WHERE "code" = 'USN_ADVANCE';

-- Add new quarterly report types (idempotent; seed also upserts these)
INSERT INTO "report_types" ("id", "name", "code", "frequency", "order", "is_active", "deadline_day", "deadline_month_offset", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'Транспортный налог — уведомление', 'TRANSPORT_NOTIF', 'QUARTERLY', 3,  TRUE, 25, 1, NOW(), NOW()),
  (gen_random_uuid(), 'АУСН — расчёт',                    'AUSN_CALC',       'QUARTERLY', 16, TRUE, 25, 1, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
