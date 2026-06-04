ALTER TABLE "organization_bank_accounts"
  ADD COLUMN "api_provider" TEXT,
  ADD COLUMN "api_token" TEXT,
  ADD COLUMN "api_account_id" TEXT,
  ADD COLUMN "use_partner_token" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "last_fetch_at" TIMESTAMP(3);
