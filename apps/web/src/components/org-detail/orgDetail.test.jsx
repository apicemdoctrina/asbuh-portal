import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("../../lib/api.js", () => ({
  api: vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })),
}));
vi.mock("../../context/AuthContext.jsx", () => ({
  useAuth: () => ({
    hasRole: (r) => r === "admin",
    hasPermission: () => true,
  }),
}));

import { api } from "../../lib/api.js";
import OrgEditForm from "./OrgEditForm.jsx";
import OrgReadView from "./OrgReadView.jsx";
import InviteClientModal from "./InviteClientModal.jsx";
import AddMemberModal from "./AddMemberModal.jsx";
import DeleteOrgModal from "./DeleteOrgModal.jsx";
import OrgOpenTasksBanner from "./OrgOpenTasksBanner.jsx";

const ORG = {
  id: "o1",
  name: "Ромашка",
  status: "active",
  inn: "7700000000",
  taxSystems: ["USN6"],
  members: [
    {
      id: "m1",
      role: "client",
      user: { id: "u1", firstName: "Иван", lastName: "Петров", email: "ivan@example.com" },
    },
  ],
  contacts: [],
  priceHistory: [],
};

beforeEach(() => {
  api.mockClear();
});

describe("OrgEditForm", () => {
  it("renders sections of the edit form prefilled from org", () => {
    render(
      <OrgEditForm
        org={ORG}
        sections={[{ id: "s1", number: 1, name: "Первый" }]}
        clientGroups={[]}
        onSaved={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText("Основная информация")).toBeInTheDocument();
    expect(screen.getByText("Бухгалтерия")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Ромашка")).toBeInTheDocument();
    expect(screen.getByDisplayValue("7700000000")).toBeInTheDocument();
    expect(screen.getByText("Сохранить")).toBeInTheDocument();
  });
});

describe("OrgReadView", () => {
  it("renders org data, members and add-member button for admin", () => {
    render(
      <MemoryRouter>
        <OrgReadView org={ORG} canEdit onDataChanged={() => {}} onAddMemberClick={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Основные сведения")).toBeInTheDocument();
    // Field renders mobile + desktop variants, so the value appears twice
    expect(screen.getAllByText("7700000000").length).toBeGreaterThan(0);
    expect(screen.getByText("Участники")).toBeInTheDocument();
    expect(screen.getByText("Петров Иван")).toBeInTheDocument();
    // "Добавить" appears in members card and in ContactsCard (mobile + desktop)
    expect(screen.getAllByText("Добавить").length).toBeGreaterThan(0);
  });
});

describe("InviteClientModal", () => {
  it("renders invite form with org name", () => {
    render(<InviteClientModal orgId="o1" orgName="Ромашка" onClose={() => {}} />);
    expect(screen.getByText("Пригласить клиента")).toBeInTheDocument();
    expect(screen.getByText(/«Ромашка»/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("client@example.com")).toBeInTheDocument();
    expect(screen.getByText("Сгенерировать ссылку")).toBeInTheDocument();
  });
});

describe("AddMemberModal", () => {
  it("loads users excluding existing members", async () => {
    api.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          { id: "u1", firstName: "Иван", lastName: "Петров", email: "ivan@example.com" },
          { id: "u2", firstName: "Анна", lastName: "Сидорова", email: "anna@example.com" },
        ]),
    });
    render(
      <AddMemberModal
        orgId="o1"
        existingMemberIds={new Set(["u1"])}
        onClose={() => {}}
        onAdded={() => {}}
      />,
    );
    expect(screen.getByText("Добавить участника")).toBeInTheDocument();
    await waitFor(() => expect(api).toHaveBeenCalledWith("/api/users"));
    expect(await screen.findByText(/Сидорова Анна/)).toBeInTheDocument();
    expect(screen.queryByText(/Петров Иван/)).not.toBeInTheDocument();
  });
});

describe("DeleteOrgModal", () => {
  it("renders confirmation with org name", () => {
    render(<DeleteOrgModal orgId="o1" orgName="Ромашка" onClose={() => {}} onDeleted={() => {}} />);
    expect(screen.getByText("Удалить организацию?")).toBeInTheDocument();
    expect(screen.getByText("Ромашка")).toBeInTheDocument();
    expect(screen.getByText("Это действие нельзя отменить.")).toBeInTheDocument();
  });
});

describe("OrgOpenTasksBanner", () => {
  it("renders nothing when no open tasks", () => {
    const { container } = render(
      <OrgOpenTasksBanner tasks={[{ id: "t1", status: "DONE" }]} onComment={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders open tasks with counters", () => {
    render(
      <OrgOpenTasksBanner
        tasks={[
          { id: "t1", status: "OPEN", priority: "HIGH", title: "Сдать НДС" },
          { id: "t2", status: "IN_PROGRESS", priority: "LOW", title: "Запросить акт" },
          { id: "t3", status: "DONE", priority: "LOW", title: "Готово" },
        ]}
        onComment={() => {}}
      />,
    );
    expect(screen.getByText("Открытые задачи — 2")).toBeInTheDocument();
    expect(screen.getByText("Сдать НДС")).toBeInTheDocument();
    expect(screen.getByText("Запросить акт")).toBeInTheDocument();
    expect(screen.queryByText("Готово")).not.toBeInTheDocument();
  });
});
