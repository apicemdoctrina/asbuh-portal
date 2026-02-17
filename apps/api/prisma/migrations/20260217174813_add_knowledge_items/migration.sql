-- CreateEnum
CREATE TYPE "KnowledgeItemType" AS ENUM ('ARTICLE', 'VIDEO', 'FILE');

-- CreateEnum
CREATE TYPE "KnowledgeAudience" AS ENUM ('STAFF', 'CLIENT');

-- CreateTable
CREATE TABLE "knowledge_items" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "KnowledgeItemType" NOT NULL,
    "audience" "KnowledgeAudience" NOT NULL,
    "tags" TEXT[],
    "description" TEXT,
    "url" TEXT,
    "original_name" TEXT,
    "storage_path" TEXT,
    "mime_type" TEXT,
    "file_size" INTEGER,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_items_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
