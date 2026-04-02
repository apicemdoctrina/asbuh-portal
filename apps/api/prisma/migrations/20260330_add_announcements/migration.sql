CREATE TYPE "AnnouncementType" AS ENUM ('FEATURE', 'FIX', 'CHANGE', 'REMOVAL');

CREATE TABLE "announcements" (
  "id"           TEXT             NOT NULL,
  "title"        TEXT             NOT NULL,
  "body"         TEXT             NOT NULL,
  "type"         "AnnouncementType" NOT NULL DEFAULT 'FEATURE',
  "published_at" TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "author_id"    TEXT             NOT NULL,
  "created_at"   TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "announcement_reads" (
  "announcement_id" TEXT        NOT NULL,
  "user_id"         TEXT        NOT NULL,
  "read_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "announcement_reads_pkey" PRIMARY KEY ("announcement_id", "user_id")
);

ALTER TABLE "announcements"
  ADD CONSTRAINT "announcements_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "announcement_reads"
  ADD CONSTRAINT "announcement_reads_announcement_id_fkey"
  FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "announcement_reads"
  ADD CONSTRAINT "announcement_reads_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
