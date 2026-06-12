import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("../../lib/api.js", () => ({
  api: vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })),
}));

import { api } from "../../lib/api.js";
import NoteCell from "./NoteCell.jsx";
import ReconcileSummaryCards from "./ReconcileSummaryCards.jsx";
import SummaryTab from "./SummaryTab.jsx";
import TransactionsTab from "./TransactionsTab.jsx";
import TochkaSetupModal from "./TochkaSetupModal.jsx";

beforeEach(() => {
  api.mockClear();
  api.mockImplementation(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }));
});

describe("NoteCell", () => {
  it("shows placeholder when no note", () => {
    render(<NoteCell orgId="o1" initialNote="" />);
    expect(screen.getByText("примечание")).toBeInTheDocument();
  });

  it("shows saved note text", () => {
    render(<NoteCell orgId="o1" initialNote="оплатит в мае" />);
    expect(screen.getByText("оплатит в мае")).toBeInTheDocument();
  });
});

describe("ReconcileSummaryCards", () => {
  it("renders all four summary values", () => {
    render(
      <ReconcileSummaryCards
        summary={{ expected: 1000, received: 600, debt: 400, debtorCount: 3 }}
      />,
    );
    expect(screen.getByText("Ожидалось")).toBeInTheDocument();
    expect(screen.getByText("1 000 ₽")).toBeInTheDocument();
    expect(screen.getByText("600 ₽")).toBeInTheDocument();
    expect(screen.getByText("400 ₽")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});

describe("SummaryTab", () => {
  it("renders month cards from API", async () => {
    api.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ months: [{ year: 2026, month: 1, total: 5000, count: 2 }] }),
      }),
    );
    render(<SummaryTab />);
    expect(await screen.findByText("Январь 2026")).toBeInTheDocument();
    // total appears in the period header and in the month card
    expect(screen.getAllByText("5 000 ₽").length).toBe(2);
    expect(screen.getByText("2 платежей")).toBeInTheDocument();
  });
});

describe("TransactionsTab", () => {
  it("renders empty state and filters", async () => {
    api.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ transactions: [], total: 0, organizations: [] }),
      }),
    );
    render(
      <MemoryRouter>
        <TransactionsTab onOrgClick={() => {}} />
      </MemoryRouter>,
    );
    expect(
      screen.getByPlaceholderText("Поиск по плательщику, ИНН, назначению..."),
    ).toBeInTheDocument();
    expect(await screen.findByText("Транзакции не найдены")).toBeInTheDocument();
  });
});

describe("TochkaSetupModal", () => {
  it("fetches accounts list on demand", async () => {
    render(<TochkaSetupModal onClose={() => {}} onAdded={() => {}} />);
    expect(screen.getByText("Подключение счёта Точка")).toBeInTheDocument();
    expect(screen.getByText("Получить счета из Точки")).toBeInTheDocument();

    api.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            { accountId: "40802...", name: "Основной", currency: "RUB", status: "Active" },
          ]),
      }),
    );
    screen.getByText("Получить счета из Точки").click();
    await waitFor(() => expect(api).toHaveBeenCalledWith("/api/payments/tochka-accounts"));
    expect(await screen.findByText("Основной")).toBeInTheDocument();
  });
});
