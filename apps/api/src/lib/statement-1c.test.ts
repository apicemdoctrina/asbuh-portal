import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseStatement } from "./statement-parser.js";
import { generate1c } from "./statement-1c.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const load = (name: string) => readFileSync(path.join(dir, "__fixtures__", name));

describe("generate1c", () => {
  it("produces Windows-1251 output that round-trips", () => {
    const original = parseStatement(load("sber.txt"));
    const buf = generate1c(original);

    // выход — Windows-1251, начинается с сигнатуры
    const head = buf.subarray(0, 20).toString("latin1");
    expect(head.startsWith("1CClientBankExchange")).toBe(true);

    const reparsed = parseStatement(buf);
    expect(reparsed.accounts).toHaveLength(1);
    expect(reparsed.accounts[0].accountNumber).toBe(original.accounts[0].accountNumber);
    expect(reparsed.accounts[0].closingBalance).toBe(original.accounts[0].closingBalance);
    expect(reparsed.accounts[0].operations).toHaveLength(2);
    expect(reparsed.meta.encoding).toBe("win1251");
    expect(reparsed.accounts[0].operations[0].purpose).toBe("Оплата по счету 1");
  });

  it("preserves both accounts in multi-account file", () => {
    const original = parseStatement(load("multi-account.txt"));
    const reparsed = parseStatement(generate1c(original));
    expect(reparsed.accounts).toHaveLength(2);
  });
});
