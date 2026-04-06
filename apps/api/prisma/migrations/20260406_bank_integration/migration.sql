-- Enums
CREATE TYPE "TransactionMatchStatus" AS ENUM ('UNMATCHED', 'AUTO', 'MANUAL', 'IGNORED');
CREATE TYPE "PaymentPeriodStatus" AS ENUM ('PENDING', 'PAID', 'PARTIAL', 'OVERDUE');

-- Bank accounts (for storing API credentials)
CREATE TABLE "bank_accounts" (
  "id" TEXT NOT NULL,
  "bank_name" TEXT NOT NULL,
  "account_number" TEXT NOT NULL,
  "access_token" TEXT,
  "refresh_token" TEXT,
  "token_expires_at" TIMESTAMPTZ,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "last_sync_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bank_accounts_account_number_key" ON "bank_accounts"("account_number");

-- Bank transactions (incoming payments)
CREATE TABLE "bank_transactions" (
  "id" TEXT NOT NULL,
  "bank_account_id" TEXT NOT NULL,
  "external_id" TEXT NOT NULL,
  "date" TIMESTAMPTZ NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "payer_name" TEXT,
  "payer_inn" TEXT,
  "payer_account" TEXT,
  "purpose" TEXT,
  "organization_id" TEXT,
  "match_status" "TransactionMatchStatus" NOT NULL DEFAULT 'UNMATCHED',
  "matched_at" TIMESTAMPTZ,
  "matched_by" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bank_transactions_external_id_key" ON "bank_transactions"("external_id");
CREATE INDEX "bank_transactions_bank_account_id_date_idx" ON "bank_transactions"("bank_account_id", "date");
CREATE INDEX "bank_transactions_organization_id_idx" ON "bank_transactions"("organization_id");
CREATE INDEX "bank_transactions_payer_inn_idx" ON "bank_transactions"("payer_inn");
CREATE INDEX "bank_transactions_match_status_idx" ON "bank_transactions"("match_status");

ALTER TABLE "bank_transactions"
  ADD CONSTRAINT "bank_transactions_bank_account_id_fkey"
  FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bank_transactions"
  ADD CONSTRAINT "bank_transactions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Payment periods (monthly reconciliation)
CREATE TABLE "payment_periods" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "expected" DECIMAL(12,2) NOT NULL,
  "received" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "status" "PaymentPeriodStatus" NOT NULL DEFAULT 'PENDING',
  "debt_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "payment_periods_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_periods_organization_id_year_month_key" ON "payment_periods"("organization_id", "year", "month");
CREATE INDEX "payment_periods_year_month_idx" ON "payment_periods"("year", "month");
CREATE INDEX "payment_periods_status_idx" ON "payment_periods"("status");

ALTER TABLE "payment_periods"
  ADD CONSTRAINT "payment_periods_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
