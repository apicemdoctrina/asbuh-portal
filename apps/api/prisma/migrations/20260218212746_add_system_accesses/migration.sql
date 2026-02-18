-- CreateEnum
CREATE TYPE "SystemAccessType" AS ENUM ('KASSA', 'ONE_C', 'OTHER');

-- CreateTable
CREATE TABLE "organization_system_accesses" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "system_type" "SystemAccessType" NOT NULL,
    "name" TEXT,
    "login" TEXT,
    "password" TEXT,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_system_accesses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organization_system_accesses_organization_id_idx" ON "organization_system_accesses"("organization_id");

-- AddForeignKey
ALTER TABLE "organization_system_accesses" ADD CONSTRAINT "organization_system_accesses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
