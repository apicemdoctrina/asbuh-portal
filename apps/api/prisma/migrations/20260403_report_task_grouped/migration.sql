-- Drop old 1:1 link between tasks and report_entries
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_report_entry_id_fkey";
DROP INDEX IF EXISTS "tasks_report_entry_id_key";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "report_entry_id";

-- Add report grouping columns to tasks (one task per report_type + year + period)
ALTER TABLE "tasks" ADD COLUMN "report_type_id" TEXT;
ALTER TABLE "tasks" ADD COLUMN "report_year" INTEGER;
ALTER TABLE "tasks" ADD COLUMN "report_period" INTEGER;

-- Unique constraint: one task per report type per period
CREATE UNIQUE INDEX "tasks_report_type_id_report_year_report_period_key"
  ON "tasks"("report_type_id", "report_year", "report_period");

-- FK to report_types
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_report_type_id_fkey"
  FOREIGN KEY ("report_type_id") REFERENCES "report_types"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Add report_entry_id to checklist items (link each org's checklist item to a report entry)
ALTER TABLE "task_checklist_items" ADD COLUMN "report_entry_id" TEXT;

CREATE UNIQUE INDEX "task_checklist_items_report_entry_id_key"
  ON "task_checklist_items"("report_entry_id");

ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_report_entry_id_fkey"
  FOREIGN KEY ("report_entry_id") REFERENCES "report_entries"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Clean up auto-generated report tasks from old approach (one per org)
DELETE FROM "tasks" WHERE category = 'REPORTING' AND "report_type_id" IS NULL AND "organization_id" IS NOT NULL;
