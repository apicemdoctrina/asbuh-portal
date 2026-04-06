-- CreateEnum
CREATE TYPE "ReportFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "ReportEntryStatus" AS ENUM ('NOT_SUBMITTED', 'SUBMITTED', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "report_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "frequency" "ReportFrequency" NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_entries" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "report_type_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "period" INTEGER NOT NULL,
    "status" "ReportEntryStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "filed_at" DATE,
    "tax_amount" DECIMAL(12,2),
    "comment" TEXT,
    "filed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "report_types_code_key" ON "report_types"("code");

-- CreateIndex
CREATE INDEX "report_entries_organization_id_idx" ON "report_entries"("organization_id");

-- CreateIndex
CREATE INDEX "report_entries_report_type_id_idx" ON "report_entries"("report_type_id");

-- CreateIndex
CREATE INDEX "report_entries_year_period_idx" ON "report_entries"("year", "period");

-- CreateIndex
CREATE UNIQUE INDEX "report_entries_organization_id_report_type_id_year_period_key" ON "report_entries"("organization_id", "report_type_id", "year", "period");

-- AddForeignKey
ALTER TABLE "report_entries" ADD CONSTRAINT "report_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_entries" ADD CONSTRAINT "report_entries_report_type_id_fkey" FOREIGN KEY ("report_type_id") REFERENCES "report_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_entries" ADD CONSTRAINT "report_entries_filed_by_id_fkey" FOREIGN KEY ("filed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
