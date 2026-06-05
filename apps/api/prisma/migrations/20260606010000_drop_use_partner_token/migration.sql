-- Снос партнёрского режима Точки: TOCHKA_JWT_TOKEN-based connect больше не поддерживается,
-- Точка подключается только через OAuth-флоу «Подключить Точку».
ALTER TABLE "organization_bank_accounts" DROP COLUMN "use_partner_token";
