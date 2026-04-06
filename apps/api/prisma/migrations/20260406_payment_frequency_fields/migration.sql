-- CreateEnum
CREATE TYPE "PaymentFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL');

-- AlterTable: add new financial fields to organizations
ALTER TABLE "organizations"
  ADD COLUMN "previous_monthly_payment" DECIMAL(12, 2),
  ADD COLUMN "price_change_date" DATE,
  ADD COLUMN "payment_frequency" "PaymentFrequency" NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN "service_start_date" DATE;
