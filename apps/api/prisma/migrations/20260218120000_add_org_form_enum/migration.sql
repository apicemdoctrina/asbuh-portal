-- CreateEnum
CREATE TYPE "OrgForm" AS ENUM ('OOO', 'IP', 'NKO', 'AO', 'PAO');

-- Nullify any existing form values that are not valid enum members
UPDATE "organizations"
SET "form" = NULL
WHERE "form" IS NOT NULL
  AND "form" NOT IN ('OOO', 'IP', 'NKO', 'AO', 'PAO');

-- AlterTable: convert String? column to OrgForm? using CAST
ALTER TABLE "organizations"
  ALTER COLUMN "form" TYPE "OrgForm" USING "form"::"OrgForm";
