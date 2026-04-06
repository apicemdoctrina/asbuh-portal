-- Drop FK constraint (empty string "" is not a valid FK reference)
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_report_section_id_fkey";

-- Make report_section_id NOT NULL with default empty string
ALTER TABLE "tasks" ALTER COLUMN "report_section_id" SET DEFAULT '';
UPDATE "tasks" SET "report_section_id" = '' WHERE "report_section_id" IS NULL;
ALTER TABLE "tasks" ALTER COLUMN "report_section_id" SET NOT NULL;
