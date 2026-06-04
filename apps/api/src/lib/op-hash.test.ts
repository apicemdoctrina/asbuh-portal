import { describe, it, expect } from "vitest";
import { opHash } from "./op-hash.js";

describe("opHash", () => {
  const base = {
    accountNumber: "40702810000000000001",
    date: "15.01.2026",
    amount: 1500.5,
    direction: "in" as const,
    number: "42",
    purpose: "Оплата по счету 1",
  };

  it("одинаковый вход → одинаковый хэш", () => {
    expect(opHash(base)).toBe(opHash({ ...base }));
  });

  it("разная сумма → разный хэш", () => {
    expect(opHash(base)).not.toBe(opHash({ ...base, amount: 1500.51 }));
  });

  it("null purpose не падает и стабилен", () => {
    const a = opHash({ ...base, purpose: null });
    const b = opHash({ ...base, purpose: null });
    expect(a).toBe(b);
  });
});
