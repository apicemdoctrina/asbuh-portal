import { describe, it, expect, vi } from "vitest";

// debt.ts тянет prisma на верхнем уровне — мокаем, тестируем чистую логику
vi.mock("./prisma.js", () => ({ default: {} }));

const { calcExpected, monthsBetween } = await import("./debt.js");

/** Дата `n` месяцев назад, середина месяца — проверяет нормализацию к 1-му числу. */
function monthsAgo(n: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - n, 15);
}

const DEBT_BASE_DATE = new Date(2025, 0, 1);

describe("monthsBetween", () => {
  it("считает целые месяцы между началами месяцев", () => {
    expect(monthsBetween(new Date(2025, 0, 1), new Date(2025, 3, 1))).toBe(3);
    expect(monthsBetween(new Date(2025, 10, 1), new Date(2026, 1, 1))).toBe(3);
    expect(monthsBetween(new Date(2025, 5, 1), new Date(2025, 5, 1))).toBe(0);
  });
});

describe("calcExpected", () => {
  it("без истории цен: monthlyPayment × месяцы от старта обслуживания", () => {
    const org = {
      monthlyPayment: 1000,
      serviceStartDate: monthsAgo(3),
      priceHistory: [],
    };
    expect(calcExpected(org)).toBe(3000);
  });

  it("старт в текущем месяце → ожидание 0", () => {
    const org = {
      monthlyPayment: 1000,
      serviceStartDate: monthsAgo(0),
      priceHistory: [],
    };
    expect(calcExpected(org)).toBe(0);
  });

  it("serviceStartDate раньше baseDate → отсчёт от baseDate", () => {
    const org = {
      monthlyPayment: 500,
      serviceStartDate: new Date(2020, 0, 1),
      priceHistory: [],
    };
    const now = new Date();
    const months = monthsBetween(DEBT_BASE_DATE, new Date(now.getFullYear(), now.getMonth(), 1));
    expect(calcExpected(org)).toBe(500 * months);
  });

  it("история цен: сегменты по периодам действия цены", () => {
    const org = {
      monthlyPayment: 999, // должен игнорироваться при наличии истории
      serviceStartDate: monthsAgo(4),
      priceHistory: [
        { price: 100, effectiveFrom: monthsAgo(4) },
        { price: 200, effectiveFrom: monthsAgo(2) },
      ],
    };
    // 2 месяца по 100 + 2 месяца по 200
    expect(calcExpected(org)).toBe(100 * 2 + 200 * 2);
  });

  it("история, начавшаяся раньше старта обслуживания, клипается по старту", () => {
    const org = {
      monthlyPayment: null,
      serviceStartDate: monthsAgo(3),
      priceHistory: [{ price: 100, effectiveFrom: monthsAgo(6) }],
    };
    expect(calcExpected(org)).toBe(100 * 3);
  });

  it("кастомный baseDate (ручные платежи) сдвигает начало отсчёта", () => {
    const customBase = new Date(monthsAgo(2).getFullYear(), monthsAgo(2).getMonth(), 1);
    const org = {
      monthlyPayment: 700,
      serviceStartDate: monthsAgo(10),
      priceHistory: [],
    };
    expect(calcExpected(org, customBase)).toBe(700 * 2);
  });

  it("monthlyPayment null без истории → 0", () => {
    const org = {
      monthlyPayment: null,
      serviceStartDate: monthsAgo(5),
      priceHistory: [],
    };
    expect(calcExpected(org)).toBe(0);
  });
});
