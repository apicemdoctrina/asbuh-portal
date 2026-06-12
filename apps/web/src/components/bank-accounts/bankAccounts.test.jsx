import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("../../lib/api.js", () => ({
  api: vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })),
}));

import { api } from "../../lib/api.js";
import { effectiveProvider, bankBadgeCls, money } from "./bankConstants.js";
import BankAccountRow from "./BankAccountRow.jsx";
import BankAccountFormModal from "./BankAccountFormModal.jsx";
import ConnectBankModal from "./ConnectBankModal.jsx";
import FetchStatementModal from "./FetchStatementModal.jsx";
import AccountStatements from "./AccountStatements.jsx";
import BankAccountsCard from "../BankAccountsCard.jsx";

const ACC = {
  id: "a1",
  bankName: "Сбербанк",
  accountNumber: "40702810000000000001",
  apiProvider: "sber",
  apiToken: "tok",
  autoFetchEnabled: false,
  login: "***",
  password: "***",
  comment: "основной",
  lastFetchAt: null,
};

beforeEach(() => {
  api.mockClear();
  api.mockImplementation(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }));
});

describe("bankConstants", () => {
  it("effectiveProvider falls back to bank name for legacy rows", () => {
    expect(effectiveProvider({ apiProvider: "tochka", bankName: "ВТБ" })).toBe("tochka");
    expect(effectiveProvider({ apiProvider: null, bankName: "Сбербанк" })).toBe("sber");
    expect(effectiveProvider({ apiProvider: null, bankName: "ВТБ" })).toBeNull();
  });

  it("bankBadgeCls returns fallback for unknown bank", () => {
    expect(bankBadgeCls("Сбербанк")).toContain("green");
    expect(bankBadgeCls("Неизвестный")).toBe("bg-muted text-body");
  });

  it("money formats with two decimals", () => {
    expect(money(1234.5)).toBe((1234.5).toLocaleString("ru-RU", { minimumFractionDigits: 2 }));
  });
});

describe("BankAccountRow", () => {
  it("renders bank badge, API status, comment and statements toggle", () => {
    render(
      <BankAccountRow
        organizationId="o1"
        acc={ACC}
        canEdit
        showLogin
        canViewSecrets
        canFetchStatements
        canConnectBank
        onEdit={() => {}}
        onDelete={() => {}}
        onConnect={() => {}}
        onFetch={() => {}}
        onDataChanged={() => {}}
        statementsRefreshSignal={0}
      />,
    );
    expect(screen.getByText("Сбербанк")).toBeInTheDocument();
    expect(screen.getByText(/API:/)).toBeInTheDocument();
    expect(screen.getByText("· подключён")).toBeInTheDocument();
    expect(screen.getByText("основной")).toBeInTheDocument();
    expect(screen.getByText(/Авто: ВЫКЛ/)).toBeInTheDocument();
    expect(screen.getByText("Выписки")).toBeInTheDocument();
  });
});

describe("AccountStatements", () => {
  it("loads statements on expand", async () => {
    api.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: "st1",
              periodStart: "2026-05-01",
              periodEnd: "2026-05-31",
              docCount: 12,
              reconcileStatus: "OK",
            },
          ]),
      }),
    );
    render(
      <AccountStatements organizationId="o1" account={ACC} canEdit onDataChanged={() => {}} />,
    );
    screen.getByText("Выписки").click();
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/api/organizations/o1/bank-accounts/a1/statements"),
    );
    expect(await screen.findByText(/12 опер\./)).toBeInTheDocument();
  });
});

describe("BankAccountFormModal", () => {
  it("create mode shows bank picker", () => {
    render(
      <BankAccountFormModal
        organizationId="o1"
        account={null}
        showLogin
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    expect(screen.getByText("Новый банковский счёт")).toBeInTheDocument();
    expect(screen.getByText("Банк *")).toBeInTheDocument();
    expect(screen.getByText("Точка")).toBeInTheDocument();
  });

  it("edit mode hides bank picker and prefills fields", () => {
    render(
      <BankAccountFormModal
        organizationId="o1"
        account={ACC}
        showLogin
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    expect(screen.getByText("Редактировать счёт: Сбербанк")).toBeInTheDocument();
    expect(screen.queryByText("Банк *")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("40702810000000000001")).toBeInTheDocument();
    expect(screen.getByDisplayValue("основной")).toBeInTheDocument();
  });
});

describe("ConnectBankModal", () => {
  it("renders with prefilled account number", () => {
    render(<ConnectBankModal organizationId="o1" acc={ACC} onClose={() => {}} />);
    expect(screen.getByText("Подключение: Сбербанк")).toBeInTheDocument();
    expect(screen.getByDisplayValue("40702810000000000001")).toBeInTheDocument();
    expect(screen.getByText("Подключить")).toBeInTheDocument();
  });
});

describe("FetchStatementModal", () => {
  it("renders period inputs and save button", () => {
    render(
      <FetchStatementModal organizationId="o1" acc={ACC} onClose={() => {}} onSaved={() => {}} />,
    );
    expect(screen.getByText("Выписка из банка: Сбербанк")).toBeInTheDocument();
    expect(screen.getByText("Сохранить файл")).toBeInTheDocument();
  });
});

describe("BankAccountsCard", () => {
  it("renders empty state", () => {
    render(
      <BankAccountsCard
        organizationId="o1"
        bankAccounts={[]}
        canEdit
        showLogin
        canViewSecrets
        canFetchStatements
        canConnectBank
        onDataChanged={() => {}}
      />,
    );
    expect(screen.getByText("Банковские счета")).toBeInTheDocument();
    expect(screen.getByText("Нет банковских счетов")).toBeInTheDocument();
    expect(screen.getByText("Добавить")).toBeInTheDocument();
  });

  it("renders account rows", () => {
    render(
      <BankAccountsCard
        organizationId="o1"
        bankAccounts={[ACC]}
        canEdit
        showLogin
        canViewSecrets
        canFetchStatements
        canConnectBank
        onDataChanged={() => {}}
      />,
    );
    expect(screen.getByText("Сбербанк")).toBeInTheDocument();
    expect(screen.getByText("основной")).toBeInTheDocument();
  });
});
