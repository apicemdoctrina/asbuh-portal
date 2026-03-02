-- CreateEnum
CREATE TYPE "RecurrenceType" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "recurrence_interval" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "recurrence_type" "RecurrenceType";
