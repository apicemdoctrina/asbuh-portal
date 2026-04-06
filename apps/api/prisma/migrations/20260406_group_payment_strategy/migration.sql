-- CreateEnum
CREATE TYPE "GroupPaymentStrategy" AS ENUM ('PER_ORG', 'CONSOLIDATED');

-- AlterTable: add payment strategy fields to client_groups
ALTER TABLE "client_groups"
  ADD COLUMN "payment_strategy" "GroupPaymentStrategy" NOT NULL DEFAULT 'PER_ORG',
  ADD COLUMN "payer_organization_id" TEXT;

-- AddForeignKey
ALTER TABLE "client_groups"
  ADD CONSTRAINT "client_groups_payer_organization_id_fkey"
  FOREIGN KEY ("payer_organization_id") REFERENCES "organizations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
