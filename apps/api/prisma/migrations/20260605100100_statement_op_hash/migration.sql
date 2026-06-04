ALTER TABLE "statement_transactions" ADD COLUMN "op_hash" TEXT;

CREATE INDEX "statement_transactions_organization_id_op_hash_idx"
  ON "statement_transactions" ("organization_id", "op_hash");
