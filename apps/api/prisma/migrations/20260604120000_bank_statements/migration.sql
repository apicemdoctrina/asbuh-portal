-- CreateEnum
CREATE TYPE "ReconcileStatus" AS ENUM ('OK', 'MISMATCH');

-- CreateTable
CREATE TABLE "bank_statements" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "uploaded_by_id" TEXT NOT NULL,
    "bank_name" TEXT,
    "account_numbers" TEXT[],
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "opening_balance" DECIMAL(14,2) NOT NULL,
    "closing_balance" DECIMAL(14,2) NOT NULL,
    "total_in" DECIMAL(14,2) NOT NULL,
    "total_out" DECIMAL(14,2) NOT NULL,
    "doc_count" INTEGER NOT NULL,
    "reconcile_status" "ReconcileStatus" NOT NULL,
    "reconcile_diff" DECIMAL(14,2),
    "original_name" TEXT NOT NULL,
    "original_path" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bank_statements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_statements_organization_id_idx" ON "bank_statements"("organization_id");
CREATE INDEX "bank_statements_created_at_idx" ON "bank_statements"("created_at");

-- AddForeignKey
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
