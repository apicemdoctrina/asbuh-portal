ALTER TABLE "tasks" ADD COLUMN "archived_at" TIMESTAMP(3);
CREATE INDEX "tasks_archived_at_idx" ON "tasks"("archived_at");
