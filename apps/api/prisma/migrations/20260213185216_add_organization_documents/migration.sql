-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('CONTRACT', 'ACT', 'INVOICE', 'REPORT', 'WAYBILL', 'OTHER');

-- CreateTable
CREATE TABLE "organization_documents" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "original_name" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "comment" TEXT,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_documents_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "organization_documents" ADD CONSTRAINT "organization_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_documents" ADD CONSTRAINT "organization_documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
