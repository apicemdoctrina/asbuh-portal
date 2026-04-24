ALTER TABLE "tasks" ADD COLUMN "visible_to_client" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "tasks" ADD COLUMN "completed_at" TIMESTAMPTZ;
UPDATE "tasks" SET "completed_at" = "updated_at" WHERE "status" = 'DONE' AND "completed_at" IS NULL;
CREATE INDEX "tasks_org_visible_status_idx" ON "tasks" ("organization_id", "visible_to_client", "status");
