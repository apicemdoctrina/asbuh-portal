-- AlterTable
ALTER TABLE "bank_statements" ADD COLUMN "edited_data" JSONB;
ALTER TABLE "bank_statements" ADD COLUMN "edited_at" TIMESTAMP(3);
