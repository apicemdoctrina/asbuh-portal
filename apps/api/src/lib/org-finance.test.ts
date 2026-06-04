import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseStatement } from "./statement-parser.js";
import { statementToTransactions, summarize } from "./org-finance.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const load = (name: string) => readFileSync(path.join(dir, "__fixtures__", name));

describe("statementToTransactions", () => {
  it("maps operations to org transactions with counterparty by direction", () => {
    const parsed = parseStatement(load("sber.txt"));
    const rows = statementToTransactions(parsed, { organizationId: "org1", statementId: "st1" });
    expect(rows).toHaveLength(2);

    const inTx = rows.find((r) => r.direction === "IN")!;
    expect(inTx.amount).toBe(5000);
    expect(inTx.counterparty).toBe("ООО Контрагент"); // плательщик
    expect(inTx.counterpartyInn).toBe("7700000000");
    expect(inTx.organizationId).toBe("org1");
    expect(inTx.statementId).toBe("st1");
    expect(inTx.date instanceof Date).toBe(true);

    const outTx = rows.find((r) => r.direction === "OUT")!;
    expect(outTx.amount).toBe(3000);
    expect(outTx.counterparty).toBe("ООО Поставщик"); // получатель
    expect(outTx.counterpartyInn).toBe("7722222222");
  });

  it("covers operations across multiple accounts", () => {
    const parsed = parseStatement(load("multi-account.txt"));
    const rows = statementToTransactions(parsed, { organizationId: "o", statementId: "s" });
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.direction === "IN")).toHaveLength(1);
    expect(rows.filter((r) => r.direction === "OUT")).toHaveLength(1);
  });
});

describe("summarize", () => {
  const txs = [
    {
      date: new Date("2026-05-05"),
      direction: "IN" as const,
      amount: 5000,
      counterparty: "A",
      counterpartyInn: "111",
    },
    {
      date: new Date("2026-05-06"),
      direction: "OUT" as const,
      amount: 3000,
      counterparty: "B",
      counterpartyInn: "222",
    },
    {
      date: new Date("2026-06-10"),
      direction: "IN" as const,
      amount: 2000,
      counterparty: "A",
      counterpartyInn: "111",
    },
  ];

  it("aggregates by month and totals", () => {
    const s = summarize(txs);
    expect(s.totals).toEqual({ in: 7000, out: 3000, net: 4000 });
    expect(s.byMonth).toEqual([
      { month: "2026-05", in: 5000, out: 3000, net: 2000 },
      { month: "2026-06", in: 2000, out: 0, net: 2000 },
    ]);
    expect(s.count).toBe(3);
  });

  it("computes top counterparties grouped by inn", () => {
    const s = summarize(txs);
    expect(s.topIn[0]).toEqual({ name: "A", inn: "111", sum: 7000 });
    expect(s.topOut[0]).toEqual({ name: "B", inn: "222", sum: 3000 });
  });

  it("handles empty input", () => {
    const s = summarize([]);
    expect(s.totals).toEqual({ in: 0, out: 0, net: 0 });
    expect(s.byMonth).toEqual([]);
    expect(s.topIn).toEqual([]);
  });
});
