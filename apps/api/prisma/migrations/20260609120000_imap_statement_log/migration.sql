CREATE TYPE "ImapIngestStatus" AS ENUM ('OK', 'NO_ATTACHMENT', 'UNKNOWN_ACCOUNT', 'PARSE_ERROR', 'OTHER_ERROR');

CREATE TABLE "imap_statement_log" (
    "id" TEXT NOT NULL,
    "mailbox" TEXT NOT NULL,
    "uid_validity" BIGINT NOT NULL,
    "uid" INTEGER NOT NULL,
    "status" "ImapIngestStatus" NOT NULL,
    "reason" TEXT,
    "account_number" TEXT,
    "statement_id" TEXT,
    "message_id" TEXT,
    "subject" TEXT,
    "from_address" TEXT,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imap_statement_log_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "imap_statement_log_mailbox_uid_validity_uid_key"
    ON "imap_statement_log"("mailbox", "uid_validity", "uid");

CREATE INDEX "imap_statement_log_status_processed_at_idx"
    ON "imap_statement_log"("status", "processed_at");

ALTER TABLE "imap_statement_log" ADD CONSTRAINT "imap_statement_log_statement_id_fkey"
    FOREIGN KEY ("statement_id") REFERENCES "bank_statements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
