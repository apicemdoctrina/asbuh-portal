-- Create PaymentDestination enum
CREATE TYPE "PaymentDestination" AS ENUM ('BANK_TOCHKA', 'CARD', 'CASH', 'UNKNOWN');

-- Clear payment_destination for inactive statuses
UPDATE "organizations"
SET "payment_destination" = NULL
WHERE "status" IN ('not_paying', 'ceased', 'left', 'own', 'closed', 'blacklisted', 'archived');

-- Nullify dashes and empty values
UPDATE "organizations"
SET "payment_destination" = NULL
WHERE "payment_destination" IN ('—', '-', '–', '') OR TRIM("payment_destination") = '';

-- Convert existing free-text values to enum
UPDATE "organizations"
SET "payment_destination" = CASE
  WHEN LOWER("payment_destination") LIKE '%точк%' OR LOWER("payment_destination") LIKE '%банк%' THEN 'BANK_TOCHKA'
  WHEN LOWER("payment_destination") LIKE '%карт%' THEN 'CARD'
  WHEN LOWER("payment_destination") LIKE '%налич%' THEN 'CASH'
  ELSE 'UNKNOWN'
END
WHERE "payment_destination" IS NOT NULL;

-- Change column type from text to enum
ALTER TABLE "organizations"
  ALTER COLUMN "payment_destination" TYPE "PaymentDestination"
  USING "payment_destination"::"PaymentDestination";
