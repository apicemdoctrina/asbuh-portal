import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseStatement } from "./statement-parser.js";
import { generate1c } from "./statement-1c.js";
import { reconcile } from "./statement-reconcile.js";
import { normalizeEdited } from "./statement-edit.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const load = (name: string) => readFileSync(path.join(dir, "__fixtures__", name));

describe("normalizeEdited", () => {
  it("syncs edited typed fields into raw so generated txt reflects them", () => {
    const st = parseStatement(load("sber.txt"));
    // правим: первая операция (поступление 5000) → 4000, и назначение
    st.accounts[0].operations[0].amount = 4000;
    st.accounts[0].operations[0].purpose = "Исправленное назначение";
    st.accounts[0].closingBalance = 2000; // 1000 + 4000 - 3000

    const norm = normalizeEdited(st);

    // raw синхронизирован
    expect(norm.accounts[0].operations[0].raw["Сумма"]).toBe("4000.00");
    expect(norm.accounts[0].operations[0].raw["НазначениеПлатежа"]).toBe("Исправленное назначение");
    // ВсегоПоступило пересчитан из операций
    expect(norm.accounts[0].totalIn).toBe(4000);
    expect(norm.accounts[0].raw["ВсегоПоступило"]).toBe("4000.00");

    // в сгенерированном txt — новые значения
    const txt = generate1c(norm);
    const reparsed = parseStatement(txt);
    expect(reparsed.accounts[0].operations[0].amount).toBe(4000);
    expect(reparsed.accounts[0].operations[0].purpose).toBe("Исправленное назначение");

    // сверка сходится после правок
    expect(reconcile(norm).status).toBe("OK");
  });

  it("drops deleted operations and recomputes totals", () => {
    const st = parseStatement(load("sber.txt"));
    // удаляем расход (3000), оставляем только поступление 5000
    st.accounts[0].operations = st.accounts[0].operations.filter((o) => o.direction === "in");
    const norm = normalizeEdited(st);
    expect(norm.accounts[0].totalOut).toBe(0);
    expect(norm.accounts[0].raw["ВсегоСписано"]).toBe("0.00");
    const txt = generate1c(norm);
    expect(parseStatement(txt).accounts[0].operations).toHaveLength(1);
  });

  it("clears a field in raw when typed value becomes empty", () => {
    const st = parseStatement(load("sber.txt"));
    st.accounts[0].operations[0].payerInn = null;
    const norm = normalizeEdited(st);
    expect("ПлательщикИНН" in norm.accounts[0].operations[0].raw).toBe(false);
  });
});
