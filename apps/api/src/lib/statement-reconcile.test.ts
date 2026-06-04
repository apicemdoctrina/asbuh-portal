import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseStatement } from "./statement-parser.js";
import { reconcile } from "./statement-reconcile.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const load = (name: string) => readFileSync(path.join(dir, "__fixtures__", name));

describe("reconcile", () => {
  it("returns OK when balances match", () => {
    const r = reconcile(parseStatement(load("sber.txt")));
    expect(r.status).toBe("OK");
    expect(r.totalDiff).toBe(0);
    expect(r.perAccount[0].sumIn).toBe(5000);
    expect(r.perAccount[0].sumOut).toBe(3000);
    expect(r.perAccount[0].computedClosing).toBe(3000);
  });

  it("returns MISMATCH when closing balance is wrong", () => {
    const st = parseStatement(load("sber.txt"));
    st.accounts[0].closingBalance = 9999; // ломаем остаток
    const r = reconcile(st);
    expect(r.status).toBe("MISMATCH");
    expect(r.perAccount[0].ok).toBe(false);
    expect(r.perAccount[0].diff).not.toBe(0);
  });

  it("flags MISMATCH with note when closing balance absent", () => {
    const st = parseStatement(load("sber.txt"));
    st.accounts[0].hasClosing = false;
    const r = reconcile(st);
    expect(r.status).toBe("MISMATCH");
    expect(r.perAccount[0].note).toMatch(/нет данных/i);
  });
});
