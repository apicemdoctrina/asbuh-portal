import { describe, it, expect } from "vitest";
import { enumerateDays } from "./sber-merge.js";
import { BankConfigError } from "./types.js";

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

  it("период > 31 дня → BankConfigError", () => {
    expect(() => enumerateDays("2026-01-01", "2026-03-01")).toThrow(BankConfigError);
  });

  it("start позже end → BankConfigError", () => {
    expect(() => enumerateDays("2026-01-05", "2026-01-01")).toThrow(BankConfigError);
  });
});
