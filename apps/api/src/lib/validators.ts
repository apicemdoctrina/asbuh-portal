import { z } from "zod";

const TAX_SYSTEMS = [
  "USN6",
  "USN15",
  "AUSN8",
  "AUSN20",
  "PSN",
  "OSNO",
  "USN_NDS5",
  "USN_NDS7",
  "USN_NDS22",
] as const;

const DIGITAL_SIGNATURE_STATUSES = ["NONE", "CLIENT", "US"] as const;
const REPORTING_CHANNELS = ["KONTUR", "SBIS", "ASTRAL"] as const;
const SERVICE_TYPES = [
  "ZERO",
  "MINIMAL",
  "FULL",
  "HR",
  "REPORTING",
  "HR_REPORTING",
  "PARTIAL",
] as const;

const VALID_STATUSES = ["active", "new", "archived"] as const;

const decimalField = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .refine((v) => !isNaN(Number(v)), {
    message: "Must be a valid decimal number",
  });

const innField = z.string().regex(/^\d{10}(\d{2})?$/, "INN must be 10 or 12 digits");

const kppField = z.string().regex(/^\d{9}$/, "KPP must be 9 digits");

export const createOrganizationSchema = z.object({
  name: z.string().min(1, "name is required"),
  inn: innField.nullable().optional(),
  form: z.string().nullable().optional(),
  status: z.enum(VALID_STATUSES).optional(),
  sectionId: z.string().uuid().nullable().optional(),
  taxSystems: z.array(z.enum(TAX_SYSTEMS)).optional(),
  employeeCount: z.number().int().min(0).nullable().optional(),
  opsPerMonth: z.number().int().min(0).nullable().optional(),
  hasCashRegister: z.boolean().optional(),
  kpp: kppField.nullable().optional(),
  legalAddress: z.string().nullable().optional(),
  digitalSignature: z.enum(DIGITAL_SIGNATURE_STATUSES).nullable().optional(),
  digitalSignatureExpiry: z.coerce.date().nullable().optional(),
  reportingChannel: z.enum(REPORTING_CHANNELS).nullable().optional(),
  serviceType: z.enum(SERVICE_TYPES).nullable().optional(),
  monthlyPayment: decimalField.nullable().optional(),
  paymentDestination: z.string().nullable().optional(),
  debtAmount: decimalField.nullable().optional(),
});

export const updateOrganizationSchema = z.object({
  name: z.string().min(1).optional(),
  inn: innField.nullable().optional(),
  form: z.string().nullable().optional(),
  status: z.enum(VALID_STATUSES).optional(),
  sectionId: z.string().uuid().nullable().optional(),
  taxSystems: z.array(z.enum(TAX_SYSTEMS)).optional(),
  employeeCount: z.number().int().min(0).nullable().optional(),
  opsPerMonth: z.number().int().min(0).nullable().optional(),
  hasCashRegister: z.boolean().optional(),
  kpp: kppField.nullable().optional(),
  legalAddress: z.string().nullable().optional(),
  digitalSignature: z.enum(DIGITAL_SIGNATURE_STATUSES).nullable().optional(),
  digitalSignatureExpiry: z.coerce.date().nullable().optional(),
  reportingChannel: z.enum(REPORTING_CHANNELS).nullable().optional(),
  serviceType: z.enum(SERVICE_TYPES).nullable().optional(),
  monthlyPayment: decimalField.nullable().optional(),
  paymentDestination: z.string().nullable().optional(),
  debtAmount: decimalField.nullable().optional(),
});

export const createBankAccountSchema = z.object({
  bankName: z.string().min(1, "bankName is required"),
  accountNumber: z.string().nullable().optional(),
  login: z.string().nullable().optional(),
  comment: z.string().nullable().optional(),
});

export const updateBankAccountSchema = z.object({
  bankName: z.string().min(1).optional(),
  accountNumber: z.string().nullable().optional(),
  login: z.string().nullable().optional(),
  comment: z.string().nullable().optional(),
});

export const createContactSchema = z.object({
  contactPerson: z.string().min(1, "contactPerson is required"),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  telegram: z.string().nullable().optional(),
  comment: z.string().nullable().optional(),
});

export const updateContactSchema = z.object({
  contactPerson: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  telegram: z.string().nullable().optional(),
  comment: z.string().nullable().optional(),
});
