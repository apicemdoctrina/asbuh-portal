-- RBAC Pack B: accountantType + temporary section assignment

-- 1. AccountantType enum + User.accountantType
CREATE TYPE "AccountantType" AS ENUM ('REPORTING', 'PRIMARY', 'UNIVERSAL');

ALTER TABLE "users" ADD COLUMN "accountant_type" "AccountantType";

-- 2. SectionMember: temporary assignment fields
ALTER TABLE "section_members" ADD COLUMN "expires_at" TIMESTAMP(3);
ALTER TABLE "section_members" ADD COLUMN "granted_by_id" TEXT;
ALTER TABLE "section_members" ADD COLUMN "reason" TEXT;

CREATE INDEX "section_members_expires_at_idx" ON "section_members"("expires_at");
