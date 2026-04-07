-- Create price_history table
CREATE TABLE "price_history" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "effective_from" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "price_history_organization_id_idx" ON "price_history"("organization_id");

ALTER TABLE "price_history"
    ADD CONSTRAINT "price_history_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing data: create price history entries from current fields
-- 1. If org has previousMonthlyPayment + priceChangeDate → old price from serviceStartDate (or 2025-01-01)
INSERT INTO "price_history" ("id", "organization_id", "price", "effective_from")
SELECT
    gen_random_uuid(),
    o.id,
    o.previous_monthly_payment,
    COALESCE(o.service_start_date, '2025-01-01')
FROM organizations o
WHERE o.previous_monthly_payment IS NOT NULL
  AND o.price_change_date IS NOT NULL;

-- 2. Current price from priceChangeDate (or serviceStartDate or 2025-01-01)
INSERT INTO "price_history" ("id", "organization_id", "price", "effective_from")
SELECT
    gen_random_uuid(),
    o.id,
    o.monthly_payment,
    CASE
        WHEN o.price_change_date IS NOT NULL THEN o.price_change_date
        ELSE COALESCE(o.service_start_date, '2025-01-01')
    END
FROM organizations o
WHERE o.monthly_payment IS NOT NULL
  AND o.monthly_payment > 0;

-- Drop old columns
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "previous_monthly_payment";
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "price_change_date";
