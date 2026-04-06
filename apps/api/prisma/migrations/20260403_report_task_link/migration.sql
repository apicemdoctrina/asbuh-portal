-- AlterTable: add deadline fields to report_types
ALTER TABLE "report_types" ADD COLUMN "deadline_day" INTEGER NOT NULL DEFAULT 25;
ALTER TABLE "report_types" ADD COLUMN "deadline_month_offset" INTEGER NOT NULL DEFAULT 1;

-- AlterTable: add report_entry_id FK to tasks
ALTER TABLE "tasks" ADD COLUMN "report_entry_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tasks_report_entry_id_key" ON "tasks"("report_entry_id");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_report_entry_id_fkey" FOREIGN KEY ("report_entry_id") REFERENCES "report_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
