ALTER TABLE "tasks" ADD COLUMN "group_id" TEXT;
CREATE INDEX "tasks_group_id_idx" ON "tasks"("group_id");
