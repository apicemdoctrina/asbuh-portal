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

const DIGITAL_SIGNATURE_STATUSES = ["NONE", "CLIENT", "US", "MCHD"] as const;
const REPORTING_CHANNELS = ["KONTUR", "SBIS", "ASTRAL", "ONE_C"] as const;
const SERVICE_TYPES = [
  "ZERO",
  "MINIMAL",
  "FULL",
  "HR",
  "REPORTING",
  "HR_REPORTING",
  "PARTIAL",
] as const;

const VALID_STATUSES = ["active", "new", "liquidating", "left", "closed", "not_paying"] as const;

const ORG_FORMS = ["OOO", "IP", "NKO", "AO", "PAO"] as const;

const decimalField = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .refine((v) => !isNaN(Number(v)), {
    message: "Must be a valid decimal number",
  });

const innField = z.string().regex(/^\d{10}(\d{2})?$/, "INN must be 10 or 12 digits");

const kppField = z.string().regex(/^\d{9}$/, "KPP must be 9 digits");

const orgRequisitesFields = {
  ogrn: z.string().nullable().optional(),
  importantComment: z.string().nullable().optional(),
  checkingAccount: z.string().nullable().optional(),
  bik: z.string().nullable().optional(),
  correspondentAccount: z.string().nullable().optional(),
  requisitesBank: z.string().nullable().optional(),
};

export const createOrganizationSchema = z.object({
  name: z.string().min(1, "name is required"),
  inn: innField.nullable().optional(),
  form: z.enum(ORG_FORMS).nullable().optional(),
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
  ...orgRequisitesFields,
});

export const updateOrganizationSchema = z.object({
  name: z.string().min(1).optional(),
  inn: innField.nullable().optional(),
  form: z.enum(ORG_FORMS).nullable().optional(),
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
  ...orgRequisitesFields,
});

export const createBankAccountSchema = z.object({
  bankName: z.string().min(1, "bankName is required"),
  accountNumber: z.string().nullable().optional(),
  login: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
  comment: z.string().nullable().optional(),
});

export const updateBankAccountSchema = z.object({
  bankName: z.string().min(1).optional(),
  accountNumber: z.string().nullable().optional(),
  login: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
  comment: z.string().nullable().optional(),
});

export const createSystemAccessSchema = z.object({
  systemType: z.enum(["KASSA", "ONE_C", "OTHER"]),
  name: z.string().nullable().optional(),
  login: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
  comment: z.string().nullable().optional(),
});

export const updateSystemAccessSchema = z.object({
  systemType: z.enum(["KASSA", "ONE_C", "OTHER"]).optional(),
  name: z.string().nullable().optional(),
  login: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
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

export const createWorkContactSchema = z.object({
  name: z.string().min(1, "name is required"),
  position: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  comment: z.string().nullable().optional(),
});

export const updateWorkContactSchema = z.object({
  name: z.string().min(1).optional(),
  position: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  comment: z.string().nullable().optional(),
});

const KNOWLEDGE_ITEM_TYPES = ["ARTICLE", "VIDEO", "FILE"] as const;
const KNOWLEDGE_AUDIENCES = ["STAFF", "CLIENT"] as const;

export const createKnowledgeItemSchema = z.object({
  title: z.string().min(1, "title is required"),
  type: z.enum(KNOWLEDGE_ITEM_TYPES),
  audience: z.enum(KNOWLEDGE_AUDIENCES),
  tags: z.array(z.string()).optional().default([]),
  description: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  url: z.string().url().nullable().optional(),
});

export const updateKnowledgeItemSchema = z.object({
  title: z.string().min(1).optional(),
  type: z.enum(KNOWLEDGE_ITEM_TYPES).optional(),
  audience: z.enum(KNOWLEDGE_AUDIENCES).optional(),
  tags: z.array(z.string()).optional(),
  description: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  url: z.string().url().nullable().optional(),
});

export const updateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().nullable().optional(),
  birthDate: z.coerce.date().nullable().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Текущий пароль обязателен"),
  newPassword: z.string().min(8, "Пароль должен быть не менее 8 символов"),
});

const DOCUMENT_TYPES = ["CONTRACT", "ACT", "INVOICE", "REPORT", "WAYBILL", "OTHER"] as const;

export const createDocumentSchema = z.object({
  type: z.enum(DOCUMENT_TYPES),
  comment: z.string().nullable().optional(),
});
