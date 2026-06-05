import { describe, it, expect } from "vitest";
import { enumerateDays, mergeDailyStatements } from "./sber-merge.js";
import { parseStatement } from "../statement-parser.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BankConfigError } from "./types.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
// фикстура из конвертера: apps/api/src/lib/__fixtures__/sber.txt
const sberFixture = readFileSync(path.join(dir, "..", "__fixtures__", "sber.txt"));

describe("enumerateDays", () => {
  it("включительно перечисляет дни периода", () => {
    expect(enumerateDays("2026-01-01", "2026-01-03")).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
    ]);
  });

  it("один день", () => {
    expect(enumerateDays("2026-01-05", "2026-01-05")).toEqual(["2026-01-05"]);
  });

  it("период > 366 дней → BankConfigError", () => {
    expect(() => enumerateDays("2024-01-01", "2025-12-31")).toThrow(BankConfigError);
  });

  it("start позже end → BankConfigError", () => {
    expect(() => enumerateDays("2026-01-05", "2026-01-01")).toThrow(BankConfigError);
  });
});

describe("mergeDailyStatements", () => {
  it("пустой список → пустая выписка без сверки", () => {
    const m = mergeDailyStatements([], {
      accountNumber: "111",
      start: "2026-01-01",
      end: "2026-01-02",
    });
    expect(m.accounts[0].operations).toHaveLength(0);
    expect(m.accounts[0].hasClosing).toBe(false);
  });

  it("два дня → объединяет операции, opening=день1, closing=деньN", () => {
    const day1 = parseStatement(sberFixture);
    const day2 = parseStatement(sberFixture);
    // подменяем балансы, чтобы проверить выбор краёв периода
    day1.accounts[0].openingBalance = 100;
    day1.accounts[0].closingBalance = 150;
    day2.accounts[0].openingBalance = 150;
    day2.accounts[0].closingBalance = 250;
    const opsTotal = day1.accounts[0].operations.length + day2.accounts[0].operations.length;

    const m = mergeDailyStatements([day1, day2], {
      accountNumber: day1.accounts[0].accountNumber,
      start: "2026-01-01",
      end: "2026-01-02",
    });
    expect(m.accounts[0].operations).toHaveLength(opsTotal);
    expect(m.accounts[0].openingBalance).toBe(100);
    expect(m.accounts[0].closingBalance).toBe(250);
    expect(m.accounts[0].hasClosing).toBe(true);
    expect(m.meta.dateStart).toBe("01.01.2026");
    expect(m.meta.dateEnd).toBe("02.01.2026");
  });
});
