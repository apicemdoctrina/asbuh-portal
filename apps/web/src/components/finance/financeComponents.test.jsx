import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { DollarSign } from "lucide-react";

vi.mock("../../lib/api.js", () => ({
  api: vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })),
}));

import { KpiCard, MarginBadge, calcGrowth, fmtShort } from "./financeShared.jsx";
import ExpensesBlock from "./ExpensesBlock.jsx";
import IncomeBlock from "./IncomeBlock.jsx";
import DebtBlock from "./DebtBlock.jsx";
import PaymentDestCards from "./PaymentDestCards.jsx";
import SectionProfitabilityBlock from "./SectionProfitabilityBlock.jsx";
import BankStatsBlock from "../management/BankStatsBlock.jsx";
import SectionsBlock from "../management/SectionsBlock.jsx";

describe("financeShared", () => {
  it("calcGrowth handles zero/null prev", () => {
    expect(calcGrowth(100, 0)).toBeNull();
    expect(calcGrowth(100, null)).toBeNull();
    expect(calcGrowth(150, 100)).toBe(50);
  });

  it("fmtShort abbreviates", () => {
    expect(fmtShort(2_500_000)).toBe("2.5M");
    expect(fmtShort(12_000)).toBe("12k");
    expect(fmtShort(500)).toBe("500");
  });

  it("KpiCard renders label, value and growth", () => {
    render(<KpiCard icon={DollarSign} label="Выручка" value="100 ₽" sub="3 орг." growth={12.3} />);
    expect(screen.getByText("Выручка")).toBeInTheDocument();
    expect(screen.getByText("100 ₽")).toBeInTheDocument();
    expect(screen.getByText("3 орг.")).toBeInTheDocument();
    expect(screen.getByText("+12.3%")).toBeInTheDocument();
  });

  it("MarginBadge renders percentage", () => {
    render(<MarginBadge margin={45} />);
    expect(screen.getByText("45%")).toBeInTheDocument();
  });
});

describe("ExpensesBlock / IncomeBlock", () => {
  it("renders expenses with total", () => {
    render(
      <ExpensesBlock
        title="Постоянные расходы"
        type="RECURRING"
        expenses={[{ id: "e1", name: "Аренда", amount: 50000, type: "RECURRING" }]}
        onAdd={() => {}}
        onDelete={() => {}}
        onUpdate={() => {}}
      />,
    );
    expect(screen.getByText("Постоянные расходы")).toBeInTheDocument();
    expect(screen.getByText("Аренда")).toBeInTheDocument();
    expect(screen.getByText("Итого:")).toBeInTheDocument();
  });

  it("renders empty incomes state", () => {
    render(<IncomeBlock incomes={[]} onAdd={() => {}} onDelete={() => {}} onUpdate={() => {}} />);
    expect(screen.getByText("Разовые доходы")).toBeInTheDocument();
    expect(screen.getByText("Нет доходов")).toBeInTheDocument();
  });
});

describe("DebtBlock", () => {
  it("renders nothing when no debt", () => {
    const { container } = render(<DebtBlock debt={{ total: 0, topDebtors: [] }} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders debtors table", () => {
    render(
      <DebtBlock
        debt={{ total: 5000, topDebtors: [{ id: "o1", name: "ООО Ромашка", debtAmount: 5000 }] }}
      />,
    );
    expect(screen.getByText("ООО Ромашка")).toBeInTheDocument();
  });
});

describe("PaymentDestCards", () => {
  it("renders three destination cards", () => {
    render(
      <MemoryRouter>
        <PaymentDestCards byPaymentDest={[{ destination: "CARD", revenue: 1000, count: 2 }]} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Куда поступают платежи")).toBeInTheDocument();
    expect(screen.getByText("Банк (Точка)")).toBeInTheDocument();
    expect(screen.getByText("Карта")).toBeInTheDocument();
    expect(screen.getByText("Наличные")).toBeInTheDocument();
  });
});

describe("SectionProfitabilityBlock", () => {
  it("renders section rows with margin", () => {
    render(
      <SectionProfitabilityBlock
        sectionProfitability={[
          {
            sectionId: "s1",
            number: 1,
            name: "Первый",
            orgCount: 5,
            revenue: 100000,
            payroll: 50000,
            profit: 50000,
            margin: 50,
          },
        ]}
      />,
    );
    expect(screen.getByText("Маржинальность участков")).toBeInTheDocument();
    expect(screen.getAllByText("№1 — Первый").length).toBeGreaterThan(0);
    expect(screen.getAllByText("50%").length).toBeGreaterThan(0);
  });
});

describe("BankStatsBlock", () => {
  it("renders nothing without banks", () => {
    const { container } = render(<BankStatsBlock bankStats={{ banks: [], totals: {} }} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders totals and bank rows", () => {
    render(
      <BankStatsBlock
        bankStats={{
          totals: { accounts: 10, organizations: 8, apiConnected: 5, autoFetch: 3 },
          banks: [
            { bankName: "Сбер", accounts: 6, organizations: 5, apiConnected: 4, autoFetch: 2 },
          ],
        }}
      />,
    );
    expect(screen.getByText("Банки клиентов")).toBeInTheDocument();
    expect(screen.getAllByText("Сбер").length).toBeGreaterThan(0);
    expect(screen.getByText("10")).toBeInTheDocument();
  });
});

describe("SectionsBlock", () => {
  it("renders section list with counters", () => {
    render(
      <SectionsBlock
        sections={[
          {
            id: "s1",
            number: 1,
            name: "Первый",
            animal: null,
            _count: { members: 2, organizations: 7 },
            formCounts: { IP: 3, OOO: 4 },
          },
        ]}
        onRefresh={() => {}}
      />,
    );
    expect(screen.getByText("Участки")).toBeInTheDocument();
    expect(screen.getByText("№1 — Первый")).toBeInTheDocument();
    expect(screen.getByText("2 чел.")).toBeInTheDocument();
    expect(screen.getByText("3 ИП")).toBeInTheDocument();
  });

  it("renders empty state", () => {
    render(<SectionsBlock sections={[]} onRefresh={() => {}} />);
    expect(screen.getByText("Нет участков")).toBeInTheDocument();
  });
});
