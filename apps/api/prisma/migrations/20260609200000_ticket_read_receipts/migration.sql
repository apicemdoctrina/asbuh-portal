-- Two-sided read receipts for tickets
ALTER TABLE "tickets" ADD COLUMN "last_read_by_staff_at" TIMESTAMP(3);
ALTER TABLE "tickets" ADD COLUMN "last_read_by_client_at" TIMESTAMP(3);
