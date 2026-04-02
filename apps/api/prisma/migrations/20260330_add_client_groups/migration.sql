-- CreateTable
CREATE TABLE "client_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_groups_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "client_group_id" TEXT;

-- CreateIndex
CREATE INDEX "organizations_client_group_id_idx" ON "organizations"("client_group_id");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_client_group_id_fkey"
    FOREIGN KEY ("client_group_id") REFERENCES "client_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
