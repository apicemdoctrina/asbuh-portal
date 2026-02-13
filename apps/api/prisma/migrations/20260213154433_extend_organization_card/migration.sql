-- CreateEnum
CREATE TYPE "TaxSystem" AS ENUM ('USN6', 'USN15', 'AUSN8', 'AUSN20', 'PSN', 'OSNO', 'USN_NDS5', 'USN_NDS7', 'USN_NDS22');

-- CreateEnum
CREATE TYPE "DigitalSignatureStatus" AS ENUM ('NONE', 'CLIENT', 'US');

-- CreateEnum
CREATE TYPE "ReportingChannel" AS ENUM ('KONTUR', 'SBIS', 'ASTRAL');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('ZERO', 'MINIMAL', 'FULL', 'HR', 'REPORTING', 'HR_REPORTING', 'PARTIAL');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "debt_amount" DECIMAL(12,2),
ADD COLUMN     "digital_signature" "DigitalSignatureStatus",
ADD COLUMN     "digital_signature_expiry" TIMESTAMP(3),
ADD COLUMN     "employee_count" INTEGER,
ADD COLUMN     "has_cash_register" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kpp" TEXT,
ADD COLUMN     "legal_address" TEXT,
ADD COLUMN     "monthly_payment" DECIMAL(12,2),
ADD COLUMN     "ops_per_month" INTEGER,
ADD COLUMN     "payment_destination" TEXT,
ADD COLUMN     "reporting_channel" "ReportingChannel",
ADD COLUMN     "service_type" "ServiceType",
ADD COLUMN     "tax_systems" "TaxSystem"[];

-- CreateTable
CREATE TABLE "organization_bank_accounts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "account_number" TEXT,
    "login" TEXT,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_contacts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "contact_person" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "telegram" TEXT,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_contacts_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "organization_bank_accounts" ADD CONSTRAINT "organization_bank_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_contacts" ADD CONSTRAINT "organization_contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
