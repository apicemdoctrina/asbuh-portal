CREATE TYPE "SupportThreadStatus" AS ENUM ('OPEN', 'RESOLVED', 'CLOSED');

CREATE TABLE "support_threads" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "SupportThreadStatus" NOT NULL DEFAULT 'OPEN',
    "user_id" TEXT NOT NULL,
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_threads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_threads_user_id_status_idx" ON "support_threads"("user_id", "status");
CREATE INDEX "support_threads_status_last_message_at_idx" ON "support_threads"("status", "last_message_at");

ALTER TABLE "support_threads" ADD CONSTRAINT "support_threads_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "support_messages" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_staff" BOOLEAN NOT NULL DEFAULT false,
    "thread_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "attachments" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_messages_thread_id_created_at_idx" ON "support_messages"("thread_id", "created_at");

ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_thread_id_fkey"
    FOREIGN KEY ("thread_id") REFERENCES "support_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
