CREATE TABLE "task_comment_reads" (
    "task_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "last_read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_comment_reads_pkey" PRIMARY KEY ("task_id","user_id")
);

ALTER TABLE "task_comment_reads" ADD CONSTRAINT "task_comment_reads_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_comment_reads" ADD CONSTRAINT "task_comment_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
