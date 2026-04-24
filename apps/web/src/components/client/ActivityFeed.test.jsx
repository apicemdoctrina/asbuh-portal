import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ActivityFeed from "./ActivityFeed.jsx";

describe("ActivityFeed", () => {
  it("shows empty state when feed is empty", () => {
    render(<ActivityFeed feed={[]} />);
    expect(screen.getByText(/Скоро здесь появится история/)).toBeInTheDocument();
  });

  it("renders task_done with title and actor", () => {
    render(
      <ActivityFeed
        feed={[
          {
            id: "1",
            kind: "task_done",
            title: "Сдана декларация УСН",
            actor: "Анна П.",
            at: new Date().toISOString(),
          },
        ]}
      />,
    );
    expect(screen.getByText(/Сдана декларация УСН/)).toBeInTheDocument();
    expect(screen.getByText(/Анна П\./)).toBeInTheDocument();
  });

  it("renders ticket_status entry", () => {
    render(
      <ActivityFeed
        feed={[
          {
            id: "2",
            kind: "ticket_status",
            title: "Тикет #41 закрыт",
            actor: null,
            at: new Date().toISOString(),
          },
        ]}
      />,
    );
    expect(screen.getByText(/Тикет #41 закрыт/)).toBeInTheDocument();
  });
});
