import { Prisma } from "@prisma/client";
import prisma from "./prisma.js";
import { loadParsed } from "./statement-store.js";
import { opHash } from "./op-hash.js";
import type { ParsedStatement } from "./statement-types.js";

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface OrgTxInput {
  organizationId: string;
  statementId: string;
  date: Date;
  direction: "IN" | "OUT";
  amount: number;
  counterparty: string | null;
  counterpartyInn: string | null;
  purpose: string | null;
  opHash: string;
}

/** DD.MM.YYYY → Date (полночь UTC); пустое → текущая дата. */
function ruDate(d: string): Date {
  if (!d) return new Date();
  const [dd, mm, yyyy] = d.split(".");
  return new Date(`${yyyy}-${mm}-${dd}`);
}

/** Чистый маппинг распарсенной выписки → строки оборотов организации. */
export function statementToTransactions(
  parsed: ParsedStatement,
  ctx: { organizationId: string; statementId: string },
): OrgTxInput[] {
  const rows: OrgTxInput[] = [];
  // Если у операции нет своей даты — берём начало периода выписки, а НЕ текущий день.
  // Иначе вся «безымянная» порция повиснет на сегодня и испортит аналитику by-month.
  const fallbackDate = parsed.meta.dateStart || "";
  for (const acc of parsed.accounts) {
    for (const op of acc.operations) {
      const isIn = op.direction === "in";
      rows.push({
        organizationId: ctx.organizationId,
        statementId: ctx.statementId,
        date: ruDate(op.date || fallbackDate),
        direction: isIn ? "IN" : "OUT",
        amount: round2(op.amount),
        counterparty: isIn ? op.payerName : op.payeeName,
        counterpartyInn: isIn ? op.payerInn : op.payeeInn,
        purpose: op.purpose,
        opHash: opHash({
          accountNumber: acc.accountNumber,
          date: op.date,
          amount: round2(op.amount),
          direction: op.direction,
          number: op.number,
          purpose: op.purpose,
        }),
      });
    }
  }
  return rows;
}

export interface FinanceSummary {
  byMonth: Array<{ month: string; in: number; out: number; net: number }>;
  totals: { in: number; out: number; net: number };
  topIn: Array<{ name: string; inn: string | null; sum: number }>;
  topOut: Array<{ name: string; inn: string | null; sum: number }>;
  count: number;
}

interface SummaryTx {
  date: Date;
  direction: "IN" | "OUT";
  amount: number;
  counterparty: string | null;
  counterpartyInn: string | null;
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function topCounterparties(
  txs: SummaryTx[],
  direction: "IN" | "OUT",
): Array<{ name: string; inn: string | null; sum: number }> {
  const map = new Map<string, { name: string; inn: string | null; sum: number }>();
  for (const t of txs) {
    if (t.direction !== direction) continue;
    const key = t.counterpartyInn || t.counterparty || "—";
    const prev = map.get(key);
    if (prev) prev.sum = round2(prev.sum + t.amount);
    else
      map.set(key, { name: t.counterparty || "—", inn: t.counterpartyInn, sum: round2(t.amount) });
  }
  return [...map.values()].sort((a, b) => b.sum - a.sum).slice(0, 5);
}

/** Чистая агрегация оборотов для финансовой аналитики. */
export function summarize(txs: SummaryTx[]): FinanceSummary {
  const byMonthMap = new Map<string, { in: number; out: number }>();
  let totalIn = 0;
  let totalOut = 0;

  for (const t of txs) {
    const k = monthKey(t.date);
    const m = byMonthMap.get(k) ?? { in: 0, out: 0 };
    if (t.direction === "IN") {
      m.in = round2(m.in + t.amount);
      totalIn = round2(totalIn + t.amount);
    } else {
      m.out = round2(m.out + t.amount);
      totalOut = round2(totalOut + t.amount);
    }
    byMonthMap.set(k, m);
  }

  const byMonth = [...byMonthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, in: v.in, out: v.out, net: round2(v.in - v.out) }));

  return {
    byMonth,
    totals: { in: totalIn, out: totalOut, net: round2(totalIn - totalOut) },
    topIn: topCounterparties(txs, "IN"),
    topOut: topCounterparties(txs, "OUT"),
    count: txs.length,
  };
}

/** Пересоздать строки оборотов для выписки (delete + insert). Безопасна к отсутствию орг. */
export async function syncStatementTransactions(statementId: string): Promise<void> {
  const item = await prisma.bankStatement.findUnique({
    where: { id: statementId },
    select: { id: true, organizationId: true, editedData: true, originalPath: true },
  });
  if (!item) return;

  await prisma.$transaction(async (tx) => {
    await tx.statementTransaction.deleteMany({ where: { statementId } });
    if (!item.organizationId) return; // непривязанная — нечего показывать
    const parsed = loadParsed(item);
    const rows = statementToTransactions(parsed, {
      organizationId: item.organizationId,
      statementId,
    });
    if (rows.length === 0) return;
    await tx.statementTransaction.createMany({
      data: rows.map((r) => ({
        organizationId: r.organizationId,
        statementId: r.statementId,
        date: r.date,
        direction: r.direction as Prisma.StatementTransactionCreateManyInput["direction"],
        amount: new Prisma.Decimal(r.amount),
        counterparty: r.counterparty,
        counterpartyInn: r.counterpartyInn,
        purpose: r.purpose,
        opHash: r.opHash,
      })),
    });
  });
}
