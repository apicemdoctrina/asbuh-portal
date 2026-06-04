import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseStatement } from "./statement-parser.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const load = (name: string) => readFileSync(path.join(dir, "__fixtures__", name));

describe("parseStatement", () => {
  it("parses header, account and operations", () => {
    const st = parseStatement(load("sber.txt"));
    expect(st.meta.sender).toBe("Бизнес Онлайн");
    expect(st.meta.dateStart).toBe("01.05.2026");
    expect(st.accounts).toHaveLength(1);

    const acc = st.accounts[0];
    expect(acc.accountNumber).toBe("40702810400000012345");
    expect(acc.openingBalance).toBe(1000);
    expect(acc.closingBalance).toBe(3000);
    expect(acc.hasClosing).toBe(true);
    expect(acc.operations).toHaveLength(2);

    const [inOp, outOp] = acc.operations;
    expect(inOp.direction).toBe("in");
    expect(inOp.amount).toBe(5000);
    expect(inOp.purpose).toBe("Оплата по счету 1");
    expect(outOp.direction).toBe("out");
    expect(outOp.amount).toBe(3000);
  });

  it("splits operations across multiple accounts by account number", () => {
    const st = parseStatement(load("multi-account.txt"));
    expect(st.accounts).toHaveLength(2);
    const acc1 = st.accounts.find((a) => a.accountNumber.endsWith("11111"))!;
    const acc2 = st.accounts.find((a) => a.accountNumber.endsWith("22222"))!;
    expect(acc1.operations).toHaveLength(1);
    expect(acc1.operations[0].direction).toBe("in");
    expect(acc2.operations).toHaveLength(1);
    expect(acc2.operations[0].direction).toBe("out");
  });

  it("throws on non-1C content", () => {
    expect(() => parseStatement(Buffer.from("just some text"))).toThrow(
      /not a 1CClientBankExchange/i,
    );
  });
});
