CREATE TYPE "AnnouncementAudience" AS ENUM ('STAFF', 'CLIENT');
ALTER TABLE "announcements" ADD COLUMN "audience" "AnnouncementAudience" NOT NULL DEFAULT 'STAFF';
