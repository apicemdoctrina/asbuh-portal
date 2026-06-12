import { Prisma } from "@prisma/client";
import prisma from "../../lib/prisma.js";
import { reconcile } from "../../lib/statement-reconcile.js";
import { BankConfigError, BankApiError } from "../../lib/bank-adapters/index.js";
import type { ParsedStatement } from "../../lib/statement-types.js";

export type AuthedUser = { userId: string; roles: string[] };

export function getStatementScopedWhere(user: AuthedUser): Prisma.BankStatementWhereInput {
  const { roles, userId } = user;
  if (roles.includes("admin") || roles.includes("supervisor")) return {};
  if (roles.includes("manager") || roles.includes("accountant")) {
    return { organization: { section: { members: { some: { userId } } } } };
  }
  // client — нет доступа в v1
  return { id: "__none__" };
}

export function isPrivileged(roles: string[]): boolean {
  return roles.some((r) => r === "admin" || r === "supervisor");
}

/** Существует ли организация И доступна ли она пользователю по его скоупу. */
export async function orgInScope(orgId: string, user: AuthedUser): Promise<boolean> {
  const allowed = await prisma.organization.findFirst({
    where: {
      id: orgId,
      ...(isPrivileged(user.roles)
        ? {}
        : { section: { members: { some: { userId: user.userId } } } }),
    },
    select: { id: true },
  });
  return Boolean(allowed);
}

/** Авто-детект организации по номеру счёта — только среди организаций в скоупе. */
export async function detectOrg(
  accountNumbers: string[],
  user: AuthedUser,
): Promise<{ id: string; name: string } | null> {
  if (!accountNumbers.length) return null;
  const bankAcc = await prisma.organizationBankAccount.findFirst({
    where: {
      accountNumber: { in: accountNumbers },
      ...(isPrivileged(user.roles)
        ? {}
        : { organization: { section: { members: { some: { userId: user.userId } } } } }),
    },
    select: { organization: { select: { id: true, name: true } } },
  });
  return bankAcc?.organization ?? null;
}

/** Агрегаты для записи BankStatement из распарсенной выписки. */
export function aggregatesFrom(parsed: ParsedStatement) {
  const rec = reconcile(parsed);
  return {
    rec,
    accountNumbers: parsed.accounts.map((a) => a.accountNumber).filter(Boolean),
    bankName: parsed.meta.sender,
    totalIn: rec.perAccount.reduce((s, p) => s + p.sumIn, 0),
    totalOut: rec.perAccount.reduce((s, p) => s + p.sumOut, 0),
    docCount: parsed.accounts.reduce((s, a) => s + a.operations.length, 0),
    openingBalance: parsed.accounts.reduce((s, a) => s + a.openingBalance, 0),
    closingBalance: parsed.accounts.reduce((s, a) => s + a.closingBalance, 0),
  };
}

export function mapBankError(err: unknown): { status: number; error: string } {
  if (err instanceof BankConfigError) return { status: 422, error: err.message };
  if (err instanceof BankApiError) return { status: 502, error: err.message };
  return { status: 500, error: "Internal server error" };
}
