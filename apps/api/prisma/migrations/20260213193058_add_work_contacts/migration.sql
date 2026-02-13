-- CreateTable
CREATE TABLE "work_contacts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT,
    "phone" TEXT,
    "comment" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_contacts_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "work_contacts" ADD CONSTRAINT "work_contacts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
