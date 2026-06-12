import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("../../lib/api.js", () => ({
  api: vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })),
}));

import StatusCell from "./StatusCell.jsx";
import ReportTypesModal from "./ReportTypesModal.jsx";
import ReportingFilters from "./ReportingFilters.jsx";
import ReportingMobileCards from "./ReportingMobileCards.jsx";
import ReportingMatrixTable from "./ReportingMatrixTable.jsx";
import {
  FREQUENCY_LABELS,
  STATUS_MAP,
  periodLabel,
  getPeriods,
  getCurrentPeriod,
} from "./reportingHelpers.js";

const DATA = {
  year: 2026,
  period: 2,
  organizations: [{ id: "o1", name: "ООО Ромашка", inn: "7701234567", section: null }],
  reportTypes: [{ id: "rt1", name: "НДС", code: "nds", frequency: "QUARTERLY", order: 1 }],
  entries: { o1_rt1: { organizationId: "o1", reportTypeId: "rt1", status: "ACCEPTED" } },
  applicability: {},
};

describe("reportingHelpers", () => {
  it("periodLabel formats by frequency", () => {
    expect(periodLabel("MONTHLY", 1)).toBe("Январь");
    expect(periodLabel("QUARTERLY", 3)).toBe("3 квартал");
    expect(periodLabel("YEARLY", 0)).toBe("Год");
  });

  it("getPeriods returns periods per frequency", () => {
    expect(getPeriods("MONTHLY")).toHaveLength(12);
    expect(getPeriods("QUARTERLY")).toEqual([1, 2, 3, 4]);
    expect(getPeriods("YEARLY")).toEqual([0]);
  });

  it("getCurrentPeriod returns valid period", () => {
    expect(getPeriods("MONTHLY")).toContain(getCurrentPeriod("MONTHLY"));
    expect(getPeriods("QUARTERLY")).toContain(getCurrentPeriod("QUARTERLY"));
    expect(getCurrentPeriod("YEARLY")).toBe(0);
  });

  it("STATUS_MAP and FREQUENCY_LABELS cover known values", () => {
    expect(STATUS_MAP.ACCEPTED.label).toBe("Принята");
    expect(STATUS_MAP.NOT_SUBMITTED.label).toBe("Не сдана");
    expect(FREQUENCY_LABELS.QUARTERLY).toBe("Ежеквартально");
  });
});

describe("StatusCell", () => {
  it("renders read-only status label", () => {
    render(
      <StatusCell
        entry={{ status: "ACCEPTED" }}
        orgId="o1"
        rtId="rt1"
        year={2026}
        period={2}
        canEdit={false}
        onUpdate={() => {}}
      />,
    );
    expect(screen.getByText("Принята")).toBeInTheDocument();
  });

  it("renders dash for not applicable read-only", () => {
    render(
      <StatusCell
        entry={{ status: "NOT_APPLICABLE" }}
        orgId="o1"
        rtId="rt1"
        year={2026}
        period={2}
        canEdit={false}
        onUpdate={() => {}}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("opens status dropdown when editable", () => {
    render(
      <StatusCell
        entry={{ status: "NOT_SUBMITTED" }}
        orgId="o1"
        rtId="rt1"
        year={2026}
        period={2}
        canEdit
        onUpdate={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Не сдана/ }));
    expect(screen.getByText("Не применимо")).toBeInTheDocument();
    expect(screen.getByText("Отклонена")).toBeInTheDocument();
  });
});

describe("ReportingFilters", () => {
  it("renders frequency tabs, period, stats badges and shown count", () => {
    render(
      <ReportingFilters
        frequency="QUARTERLY"
        setFrequency={() => {}}
        year={2026}
        setYear={() => {}}
        period={2}
        onPrevPeriod={() => {}}
        onNextPeriod={() => {}}
        isAdmin
        sections={[]}
        sectionFilter=""
        setSectionFilter={() => {}}
        search=""
        setSearch={() => {}}
        onlyProblems={false}
        setOnlyProblems={() => {}}
        stats={{ total: 5, submitted: 1, accepted: 2, rejected: 1, notSubmitted: 1 }}
        shownCount={1}
        totalCount={3}
      />,
    );
    expect(screen.getByText("Ежеквартально")).toBeInTheDocument();
    expect(screen.getByText("2 квартал 2026")).toBeInTheDocument();
    expect(screen.getByText("Всего: 5")).toBeInTheDocument();
    expect(screen.getByText("Принято: 2")).toBeInTheDocument();
    expect(screen.getByText("Не сдано: 1")).toBeInTheDocument();
    expect(screen.getByText("Показано: 1 из 3")).toBeInTheDocument();
    expect(screen.getByText("Только с пропусками")).toBeInTheDocument();
  });
});

describe("ReportingMobileCards", () => {
  it("renders org card with report type rows", () => {
    render(
      <ReportingMobileCards
        orgs={DATA.organizations}
        data={DATA}
        canEdit={false}
        onUpdate={() => {}}
      />,
    );
    expect(screen.getByText("ООО Ромашка")).toBeInTheDocument();
    expect(screen.getByText("ИНН 7701234567")).toBeInTheDocument();
    expect(screen.getByText("НДС")).toBeInTheDocument();
    expect(screen.getByText("Принята")).toBeInTheDocument();
  });
});

describe("ReportingMatrixTable", () => {
  it("renders matrix with org rows and report type columns", () => {
    render(
      <ReportingMatrixTable
        orgs={DATA.organizations}
        data={DATA}
        canEdit={false}
        onUpdate={() => {}}
      />,
    );
    expect(screen.getByText("Организация")).toBeInTheDocument();
    expect(screen.getByText("НДС")).toBeInTheDocument();
    expect(screen.getByText("ООО Ромашка")).toBeInTheDocument();
    expect(screen.getByText("Принята")).toBeInTheDocument();
  });
});

describe("ReportTypesModal", () => {
  it("renders title and add button", async () => {
    render(<ReportTypesModal onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByText("Типы отчётов")).toBeInTheDocument();
    expect(await screen.findByText("Добавить тип")).toBeInTheDocument();
  });
});
