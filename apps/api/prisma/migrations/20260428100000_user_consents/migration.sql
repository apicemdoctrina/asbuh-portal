CREATE TABLE "user_consents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "document_version" TEXT NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,

    CONSTRAINT "user_consents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_consents_user_id_document_type_document_version_key"
  ON "user_consents"("user_id", "document_type", "document_version");

CREATE INDEX "user_consents_user_id_idx" ON "user_consents"("user_id");

ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
