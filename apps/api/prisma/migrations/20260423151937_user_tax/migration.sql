-- Add optional tax column for staff compensation

ALTER TABLE "users" ADD COLUMN "tax" DECIMAL(12, 2);
