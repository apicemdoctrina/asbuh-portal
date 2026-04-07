-- Make bankAccountId and externalId nullable for manual transactions
ALTER TABLE "bank_transactions" ALTER COLUMN "bank_account_id" DROP NOT NULL;
DROP INDEX IF EXISTS "bank_transactions_external_id_key";
ALTER TABLE "bank_transactions" DROP CONSTRAINT IF EXISTS "bank_transactions_external_id_key";
ALTER TABLE "bank_transactions" ALTER COLUMN "external_id" DROP NOT NULL;
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_external_id_key" UNIQUE ("external_id");

-- Add is_manual flag
ALTER TABLE "bank_transactions" ADD COLUMN "is_manual" BOOLEAN NOT NULL DEFAULT false;
