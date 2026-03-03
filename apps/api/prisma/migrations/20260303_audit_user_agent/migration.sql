-- Add user_agent column to audit_logs
ALTER TABLE "audit_logs" ADD COLUMN "user_agent" TEXT;
