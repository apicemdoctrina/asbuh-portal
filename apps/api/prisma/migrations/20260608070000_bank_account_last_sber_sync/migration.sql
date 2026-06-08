-- Курсор для Сбер /v2/statement/increment: храним момент последнего успешного
-- incremental-синка. Следующий запрос идёт с lastModifyDate=<это значение>.
ALTER TABLE "organization_bank_accounts"
  ADD COLUMN "last_sber_sync" TIMESTAMP(3);
