import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("../../lib/api.js", () => ({
  api: vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })),
}));

import StaffCard from "./StaffCard.jsx";
import CompensationModal from "./CompensationModal.jsx";
import CreateStaffModal from "./CreateStaffModal.jsx";
import EditStaffModal from "./EditStaffModal.jsx";
import { isOnline, getPrimaryRole, formatMoney } from "./staffConstants.js";

const USER = {
  id: "u1",
  firstName: "Иван",
  lastName: "Петров",
  email: "ivan@example.com",
  roles: ["accountant"],
  accountantType: "UNIVERSAL",
  isActive: true,
  salary: 50000,
  tax: 7000,
  sections: [{ id: "s1", number: 3, name: "Третий", animal: null }],
  lastSeenAt: null,
};

describe("staffConstants", () => {
  it("isOnline is false for null and old timestamps", () => {
    expect(isOnline(null)).toBe(false);
    expect(isOnline(new Date(Date.now() - 10 * 60 * 1000).toISOString())).toBe(false);
    expect(isOnline(new Date().toISOString())).toBe(true);
  });

  it("getPrimaryRole picks highest role", () => {
    expect(getPrimaryRole(["accountant", "admin"])).toBe("admin");
    expect(getPrimaryRole(["accountant"])).toBe("accountant");
    expect(getPrimaryRole(["client"])).toBeNull();
  });

  it("formatMoney handles null", () => {
    expect(formatMoney(null)).toBe("—");
    // ru-RU locale uses a non-breaking space as thousands separator
    expect(formatMoney(50000)).toBe((50000).toLocaleString("ru-RU"));
  });
});

describe("StaffCard", () => {
  it("renders identity, role badges, sections and compensation", () => {
    render(
      <MemoryRouter>
        <StaffCard
          u={USER}
          w={{ openTasks: 3, overdueTasks: 1, doneLast30d: 5 }}
          online={false}
          avatarColor="bg-emerald-500 text-white"
          isAdmin
          canManageCompensation
          canDelete
          onComp={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("Петров Иван")).toBeInTheDocument();
    expect(screen.getByText("Бухгалтер")).toBeInTheDocument();
    expect(screen.getByText("Универсал")).toBeInTheDocument();
    // SectionIcon fallback also renders the section number, so №3 appears twice
    expect(screen.getAllByText(/№3/).length).toBeGreaterThan(0);
    expect(screen.getByTitle("Зарплата")).toHaveTextContent("₽");
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});

describe("CompensationModal", () => {
  it("renders prefilled salary and tax", () => {
    render(<CompensationModal user={USER} onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByText("Зарплата и налог")).toBeInTheDocument();
    expect(screen.getByDisplayValue("50000")).toBeInTheDocument();
    expect(screen.getByDisplayValue("7000")).toBeInTheDocument();
  });
});

describe("CreateStaffModal", () => {
  it("renders form with role radios", () => {
    render(<CreateStaffModal onClose={() => {}} onCreated={() => {}} />);
    expect(screen.getByText("Новый сотрудник")).toBeInTheDocument();
    expect(screen.getByText("Фамилия *")).toBeInTheDocument();
    expect(screen.getByText("Руководитель")).toBeInTheDocument();
    expect(screen.getByText("Создать")).toBeInTheDocument();
  });
});

describe("EditStaffModal", () => {
  it("renders prefilled form with accountant type section", () => {
    render(
      <EditStaffModal user={USER} currentUserId="u2" onClose={() => {}} onUpdated={() => {}} />,
    );
    expect(screen.getByText("Редактировать сотрудника")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Петров")).toBeInTheDocument();
    expect(screen.getByDisplayValue("ivan@example.com")).toBeInTheDocument();
    expect(screen.getByText("Тип бухгалтера")).toBeInTheDocument();
    expect(screen.getByText("Сменить пароль")).toBeInTheDocument();
  });
});
