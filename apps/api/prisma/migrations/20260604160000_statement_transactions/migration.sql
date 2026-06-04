-- CreateEnum
CREATE TYPE "FlowDirection" AS ENUM ('IN', 'OUT');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "finance_visible_to_client" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "statement_transactions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "statement_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "direction" "FlowDirection" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "counterparty" TEXT,
    "counterparty_inn" TEXT,
    "purpose" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "statement_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "statement_transactions_organization_id_date_idx" ON "statement_transactions"("organization_id", "date");
CREATE INDEX "statement_transactions_statement_id_idx" ON "statement_transactions"("statement_id");

-- AddForeignKey
ALTER TABLE "statement_transactions" ADD CONSTRAINT "statement_transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "statement_transactions" ADD CONSTRAINT "statement_transactions_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "bank_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
