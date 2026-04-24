import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import ClientGroupDashboard from "./ClientGroupDashboard.jsx";

const okSummary = { debt: 0, nextDeadline: null, openTickets: 0 };
const okOrg = { id: "o1", name: "А", status: "ok", actions: [], summary: okSummary, feed: [] };
const actionOrg = {
  id: "o2",
  name: "Б",
  status: "action_required",
  actions: [{ type: "ticket_waiting", title: "Ответить #1", dueAt: null, link: "/tickets/1" }],
  summary: { ...okSummary, openTickets: 1 },
  feed: [],
};

function renderGroup(props) {
  return render(
    <MemoryRouter>
      <ClientGroupDashboard {...props} />
    </MemoryRouter>,
  );
}

describe("ClientGroupDashboard", () => {
  it("renders aggregate header and one card per org", () => {
    renderGroup({
      group: { id: "g1", name: "Группа", aggregateStatus: "action_required", totalDebt: 0 },
      organizations: [okOrg, actionOrg],
    });
    // Aggregated header text from the spec ("N орг из M требуют внимания")
    expect(screen.getByText(/орг из/)).toBeInTheDocument();
    expect(screen.getByText("А")).toBeInTheDocument();
    expect(screen.getByText("Б")).toBeInTheDocument();
  });

  it("auto-expands the first non-ok org", () => {
    renderGroup({
      group: { id: "g1", name: "Группа", aggregateStatus: "action_required", totalDebt: 0 },
      organizations: [okOrg, actionOrg],
    });
    // The action_required org is auto-expanded → its action title is visible.
    expect(screen.getByText(/Ответить #1/)).toBeInTheDocument();
  });

  it("collapses an expanded org when clicked again", () => {
    renderGroup({
      group: { id: "g1", name: "Группа", aggregateStatus: "action_required", totalDebt: 0 },
      organizations: [actionOrg],
    });
    expect(screen.getByText(/Ответить #1/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Б"));
    expect(screen.queryByText(/Ответить #1/)).not.toBeInTheDocument();
  });
});
