import { describe, it, expect } from "vitest";
import { tochkaToParsedStatement, resolveToken } from "./tochka.js";
import { BankConfigError } from "./types.js";
import { encrypt } from "../crypto.js";
import { generate1c } from "../statement-1c.js";
import { parseStatement } from "../statement-parser.js";

const ACC = "40702810000000000001";

const incoming = {
  transactionId: "t1",
  creditDebitIndicator: "Credit" as const,
  documentNumber: "42",
  documentProcessDate: "2026-01-15",
  description: "Оплата по счету 1",
  Amount: { amount: 1500.5, currency: "RUB" },
  DebtorParty: { inn: "7700000001", name: "ООО Плательщик" },
  DebtorAccount: { identification: "40702810999999999999" },
};

const outgoing = {
  transactionId: "t2",
  creditDebitIndicator: "Debit" as const,
  documentNumber: "43",
  documentProcessDate: "2026-01-16",
  description: "Оплата поставщику",
  Amount: { amount: 700, currency: "RUB" },
  CreditorParty: { inn: "7700000002", name: "ООО Получатель" },
  CreditorAccount: { identification: "40702810888888888888" },
};

describe("tochkaToParsedStatement", () => {
  it("Credit → in, контрагент = плательщик", () => {
    const st = tochkaToParsedStatement({
      accountNumber: ACC,
      start: "2026-01-01",
      end: "2026-01-31",
      transactions: [incoming],
      balance: null,
    });
    const op = st.accounts[0].operations[0];
    expect(op.direction).toBe("in");
    expect(op.payerName).toBe("ООО Плательщик");
    expect(op.payerInn).toBe("7700000001");
    expect(op.payeeAccount).toBe(ACC);
    expect(op.docType).toBe("03");
    expect(op.date).toBe("15.01.2026");
  });

  it("Debit → out, контрагент = получатель", () => {
    const st = tochkaToParsedStatement({
      accountNumber: ACC,
      start: "2026-01-01",
      end: "2026-01-31",
      transactions: [outgoing],
      balance: null,
    });
    const op = st.accounts[0].operations[0];
    expect(op.direction).toBe("out");
    expect(op.payeeName).toBe("ООО Получатель");
    expect(op.payerAccount).toBe(ACC);
  });

  it("balance=null → hasClosing=false", () => {
    const st = tochkaToParsedStatement({
      accountNumber: ACC,
      start: "2026-01-01",
      end: "2026-01-31",
      transactions: [incoming],
      balance: null,
    });
    expect(st.accounts[0].hasClosing).toBe(false);
  });

  it("balance задан → opening/closing проставлены", () => {
    const st = tochkaToParsedStatement({
      accountNumber: ACC,
      start: "2026-01-01",
      end: "2026-01-31",
      transactions: [incoming],
      balance: { opening: 1000, closing: 2500.5 },
    });
    expect(st.accounts[0].hasClosing).toBe(true);
    expect(st.accounts[0].openingBalance).toBe(1000);
    expect(st.accounts[0].closingBalance).toBe(2500.5);
  });

  it("перевод между своими счетами: счёт контрагента = наш → обнуляется, направление сохраняется", () => {
    const selfTransfer = {
      transactionId: "t3",
      creditDebitIndicator: "Credit" as const,
      documentNumber: "44",
      documentProcessDate: "2026-01-17",
      description: "Перевод между счетами",
      Amount: { amount: 300, currency: "RUB" },
      DebtorParty: { name: "Своя организация" },
      DebtorAccount: { identification: ACC }, // контрагент = наш же счёт
    };
    const st = tochkaToParsedStatement({
      accountNumber: ACC,
      start: "2026-01-01",
      end: "2026-01-31",
      transactions: [selfTransfer],
      balance: null,
    });
    expect(st.accounts[0].operations[0].payerAccount).toBeNull();
    // round-trip не теряет операцию и держит направление "in"
    const reparsed = parseStatement(generate1c(st));
    expect(reparsed.accounts[0].operations).toHaveLength(1);
    expect(reparsed.accounts[0].operations[0].direction).toBe("in");
  });

  it("round-trip: generate1c → parseStatement сохраняет направление и счёт", () => {
    const st = tochkaToParsedStatement({
      accountNumber: ACC,
      start: "2026-01-01",
      end: "2026-01-31",
      transactions: [incoming, outgoing],
      balance: { opening: 1000, closing: 1800.5 },
    });
    const reparsed = parseStatement(generate1c(st));
    expect(reparsed.accounts).toHaveLength(1);
    expect(reparsed.accounts[0].accountNumber).toBe(ACC);
    const dirs = reparsed.accounts[0].operations.map((o) => o.direction).sort();
    expect(dirs).toEqual(["in", "out"]);
    expect(reparsed.accounts[0].operations.find((o) => o.direction === "in")?.purpose).toBe(
      "Оплата по счету 1",
    );
  });
});

describe("resolveToken", () => {
  it("свой токен → расшифровка", () => {
    const enc = encrypt("my-secret-token");
    expect(resolveToken({ apiToken: enc })).toBe("my-secret-token");
  });

  it("нет токена → BankConfigError", () => {
    expect(() => resolveToken({ apiToken: null })).toThrow(BankConfigError);
  });
});
