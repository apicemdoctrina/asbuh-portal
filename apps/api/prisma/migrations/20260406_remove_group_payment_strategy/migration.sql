-- Remove payment strategy fields from client_groups
ALTER TABLE "client_groups" DROP COLUMN IF EXISTS "payment_strategy";
ALTER TABLE "client_groups" DROP COLUMN IF EXISTS "payer_organization_id";

-- Drop the enum type
DROP TYPE IF EXISTS "GroupPaymentStrategy";
