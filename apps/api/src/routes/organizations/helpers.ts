import { Prisma } from "@prisma/client";
import rateLimit from "express-rate-limit";
import prisma from "../../lib/prisma.js";
import { notifyWithTelegram } from "../../lib/notify.js";

export const secretsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "Too many secret view requests, try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Notify all section members (except actorUserId) that a new org was added to their section. */
export async function notifySectionMembers(
  sectionId: string,
  orgName: string,
  orgId: string,
  actorUserId: string,
): Promise<void> {
  const members = await prisma.sectionMember.findMany({
    where: { sectionId, userId: { not: actorUserId } },
    select: { userId: true, section: { select: { number: true } } },
  });
  await Promise.all(
    members.map((m) =>
      notifyWithTelegram(
        m.userId,
        "org_added_to_section",
        "Новая организация на участке",
        `Организация «${orgName}» добавлена на участок №${m.section.number}`,
        `/organizations/${orgId}`,
        `🏢 <b>Новая организация на участке №${m.section.number}</b>\n\n«${orgName}»`,
      ),
    ),
  );
}

/** Notify section members that org's status changed. */
export async function notifyOrgStatusChanged(
  orgId: string,
  oldStatus: string | null,
  newStatus: string | null,
  actorUserId: string,
): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true, sectionId: true, section: { select: { number: true } } },
  });
  if (!org?.sectionId) return;
  const members = await prisma.sectionMember.findMany({
    where: { sectionId: org.sectionId, userId: { not: actorUserId } },
    select: { userId: true },
  });
  const sectionNum = org.section?.number ?? "—";
  await Promise.all(
    members.map((m) =>
      notifyWithTelegram(
        m.userId,
        "org_status_changed",
        "Изменён статус организации",
        `«${org.name}»: ${oldStatus ?? "—"} → ${newStatus ?? "—"}`,
        `/organizations/${orgId}`,
        `🔄 <b>Статус организации изменён</b>\n\nОрганизация: «${org.name}»\nУчасток №${sectionNum}\n\n${oldStatus ?? "—"} → <b>${newStatus ?? "—"}</b>`,
      ),
    ),
  );
}

/** Notify section members that org's monthly payment changed. */
export async function notifyOrgPaymentChanged(
  orgId: string,
  oldAmount: Prisma.Decimal | null,
  newAmount: Prisma.Decimal | null,
  actorUserId: string,
): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true, sectionId: true, section: { select: { number: true } } },
  });
  if (!org?.sectionId) return;
  const members = await prisma.sectionMember.findMany({
    where: { sectionId: org.sectionId, userId: { not: actorUserId } },
    select: { userId: true },
  });
  const sectionNum = org.section?.number ?? "—";
  const fmt = (v: Prisma.Decimal | null) => (v == null ? "—" : `${v.toString()} ₽`);
  await Promise.all(
    members.map((m) =>
      notifyWithTelegram(
        m.userId,
        "org_payment_changed",
        "Изменена сумма оплаты",
        `«${org.name}»: ${fmt(oldAmount)} → ${fmt(newAmount)}`,
        `/organizations/${orgId}`,
        `💰 <b>Изменена сумма оплаты</b>\n\nОрганизация: «${org.name}»\nУчасток №${sectionNum}\n\n${fmt(oldAmount)} → <b>${fmt(newAmount)}</b>`,
      ),
    ),
  );
}

/** Check if user has only client-level access (no admin/manager/accountant). */
export function isClientOnly(roles: string[]): boolean {
  return !roles.some((r) => ["admin", "manager", "accountant"].includes(r));
}

export function isAdminLike(roles: string[]): boolean {
  return roles.includes("admin") || roles.includes("supervisor");
}

/** Mask bank account secrets for staff: login/password → "***", null stays null. */
export function maskBankAccountSecrets(
  accounts: Array<Record<string, unknown>>,
  stripForClient: boolean,
): void {
  for (const account of accounts) {
    if (stripForClient) {
      delete account.login;
      delete account.password;
      delete account.apiToken;
    } else {
      account.login = account.login != null ? "***" : null;
      account.password = account.password != null ? "***" : null;
      // apiToken защищаем оборонительно — на случай, если попадёт в выборку
      if ("apiToken" in account) {
        account.apiToken = account.apiToken != null ? "***" : null;
      }
    }
  }
}

/** Mask system access secrets identically to bank accounts. */
export function maskSystemAccessSecrets(
  accesses: Array<Record<string, unknown>> | null | undefined,
  stripForClient: boolean,
): void {
  if (!accesses) return;
  for (const access of accesses) {
    if (stripForClient) {
      delete access.login;
      delete access.password;
    } else {
      access.login = access.login != null ? "***" : null;
      access.password = access.password != null ? "***" : null;
    }
  }
}

/** Build Prisma data from validated fields, converting decimals. */
export function buildOrgData(validated: Record<string, unknown>): Prisma.OrganizationUpdateInput {
  const data: Prisma.OrganizationUpdateInput = {};
  const directFields = [
    "name",
    "inn",
    "ogrn",
    "form",
    "status",
    "taxSystems",
    "employeeCount",
    "opsPerMonth",
    "hasCashRegister",
    "kpp",
    "legalAddress",
    "digitalSignature",
    "digitalSignatureExpiry",
    "reportingChannel",
    "serviceType",
    "paymentDestination",
    "paymentFrequency",
    "serviceStartDate",
    "importantComment",
    "checkingAccount",
    "bik",
    "correspondentAccount",
    "requisitesBank",
    "financeVisibleToClient",
  ] as const;

  for (const field of directFields) {
    if (validated[field] !== undefined) {
      (data as Record<string, unknown>)[field] = validated[field];
    }
  }

  // Decimal fields need Prisma.Decimal conversion
  for (const field of ["monthlyPayment", "debtAmount"] as const) {
    if (validated[field] !== undefined) {
      const val = validated[field];
      (data as Record<string, unknown>)[field] =
        val === null ? null : new Prisma.Decimal(val as string);
    }
  }

  // sectionId → relation connect/disconnect
  if (validated.sectionId !== undefined) {
    data.section = validated.sectionId
      ? { connect: { id: validated.sectionId as string } }
      : { disconnect: true };
  }

  // clientGroupId → relation connect/disconnect
  if (validated.clientGroupId !== undefined) {
    data.clientGroup = validated.clientGroupId
      ? { connect: { id: validated.clientGroupId as string } }
      : { disconnect: true };
  }

  return data;
}
