import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("../../lib/api.js", () => ({
  api: vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })),
}));

import { api } from "../../lib/api.js";
import BulkModal from "./BulkModal.jsx";
import ManageGroupsModal from "./ManageGroupsModal.jsx";
import CreateOrgModal from "./CreateOrgModal.jsx";

beforeEach(() => {
  api.mockClear();
});

describe("BulkModal", () => {
  it("renders assign mode and loads non-members", async () => {
    render(
      <BulkModal
        mode="assign"
        selectedIds={new Set(["o1", "o2"])}
        onClose={() => {}}
        onSuccess={() => {}}
      />,
    );
    expect(screen.getAllByText("Назначить ответственного").length).toBeGreaterThan(0);
    expect(screen.getByText("2")).toBeInTheDocument();
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        "/api/organizations/bulk/non-members",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(await screen.findByText("Пользователи не найдены")).toBeInTheDocument();
  });
});

describe("ManageGroupsModal", () => {
  it("renders empty groups list and create form", () => {
    render(<ManageGroupsModal groups={[]} onClose={() => {}} onChanged={() => {}} />);
    expect(screen.getByText("Группы клиентов")).toBeInTheDocument();
    expect(screen.getByText("Групп пока нет")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Название *")).toBeInTheDocument();
  });

  it("renders group rows", () => {
    render(
      <ManageGroupsModal
        groups={[{ id: "g1", name: "Холдинг", description: "тест", _count: { organizations: 3 } }]}
        onClose={() => {}}
        onChanged={() => {}}
      />,
    );
    expect(screen.getByText("Холдинг")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});

describe("CreateOrgModal", () => {
  it("renders form fields with sections and groups", () => {
    render(
      <CreateOrgModal
        sections={[{ id: "s1", number: 1, name: "Первый" }]}
        clientGroups={[{ id: "g1", name: "Группа" }]}
        onClose={() => {}}
        onCreated={() => {}}
      />,
    );
    expect(screen.getByText("Новая организация")).toBeInTheDocument();
    expect(screen.getByText("Название *")).toBeInTheDocument();
    expect(screen.getByText("Участок")).toBeInTheDocument();
    expect(screen.getByText("Группа клиента")).toBeInTheDocument();
  });
});
