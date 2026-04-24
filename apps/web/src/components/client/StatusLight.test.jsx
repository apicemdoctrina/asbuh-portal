import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import StatusLight from "./StatusLight.jsx";

function renderWith(props) {
  return render(
    <MemoryRouter>
      <StatusLight {...props} />
    </MemoryRouter>,
  );
}

describe("StatusLight", () => {
  it("renders ok with default subtitle when no actions and no deadline", () => {
    renderWith({
      status: "ok",
      actions: [],
      summary: { debt: 0, nextDeadline: null, openTickets: 0 },
    });
    expect(screen.getByText(/Полёт нормальный/)).toBeInTheDocument();
    expect(screen.getByText(/Все отчёты в графике/)).toBeInTheDocument();
  });

  it("renders action_required header and lists actions", () => {
    renderWith({
      status: "action_required",
      actions: [
        { type: "ticket_waiting", title: "Ответить #42", dueAt: null, link: "/tickets/42" },
      ],
      summary: { debt: 0, nextDeadline: null, openTickets: 1 },
    });
    expect(screen.getByText(/Требуется ваше действие/)).toBeInTheDocument();
    expect(screen.getByText(/Ответить #42/)).toBeInTheDocument();
  });

  it("renders overdue header in red and shows payment action", () => {
    renderWith({
      status: "overdue",
      actions: [
        {
          type: "payment_overdue",
          title: "Оплатить апрель — 12 000 ₽",
          dueAt: null,
          link: "/my-payments",
        },
      ],
      summary: { debt: 12000, nextDeadline: null, openTickets: 0 },
    });
    expect(screen.getByText(/Есть просрочка/)).toBeInTheDocument();
    expect(screen.getByText(/Оплатить апрель/)).toBeInTheDocument();
  });
});
