-- Add section scoping to report tasks
ALTER TABLE "tasks" ADD COLUMN "report_section_id" TEXT;

-- Drop old unique (one task per report type per period)
DROP INDEX IF EXISTS "tasks_report_type_id_report_year_report_period_key";

-- New unique: one task per report type per period PER SECTION
CREATE UNIQUE INDEX "tasks_report_type_id_report_year_report_period_report_section_key"
  ON "tasks"("report_type_id", "report_year", "report_period", "report_section_id");

-- FK to sections
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_report_section_id_fkey"
  FOREIGN KEY ("report_section_id") REFERENCES "sections"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Clean up existing report tasks (will be recreated per-section by generator)
DELETE FROM "task_checklist_items" WHERE "task_id" IN (SELECT id FROM "tasks" WHERE "report_type_id" IS NOT NULL);
DELETE FROM "task_assignees" WHERE "task_id" IN (SELECT id FROM "tasks" WHERE "report_type_id" IS NOT NULL);
DELETE FROM "tasks" WHERE "report_type_id" IS NOT NULL;
