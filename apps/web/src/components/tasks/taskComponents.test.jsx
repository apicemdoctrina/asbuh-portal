import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import TaskCard from "./TaskCard.jsx";
import KanbanCard from "./KanbanCard.jsx";
import GroupedTaskRow from "./GroupedTaskRow.jsx";
import { aggStatus, isOverdue, getNextStatuses } from "./taskConstants.js";

const baseTask = {
  id: "t1",
  title: "Сдать отчёт по НДС",
  status: "OPEN",
  priority: "MEDIUM",
  category: "REPORTING",
  dueDate: null,
  assignees: [],
};

const noop = () => {};
const handlers = {
  onEdit: noop,
  onDelete: noop,
  onStatusChange: noop,
  onComment: noop,
  onChecklist: noop,
};

function renderWith(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("taskConstants helpers", () => {
  it("aggStatus: all done → DONE, mixed done/cancelled → DONE, any in progress → IN_PROGRESS", () => {
    expect(aggStatus([{ status: "DONE" }, { status: "DONE" }])).toBe("DONE");
    expect(aggStatus([{ status: "DONE" }, { status: "CANCELLED" }])).toBe("DONE");
    expect(aggStatus([{ status: "CANCELLED" }, { status: "CANCELLED" }])).toBe("CANCELLED");
    expect(aggStatus([{ status: "OPEN" }, { status: "IN_PROGRESS" }])).toBe("IN_PROGRESS");
    expect(aggStatus([{ status: "OPEN" }, { status: "DONE" }])).toBe("OPEN");
  });

  it("isOverdue: false for DONE/CANCELLED even with past dueDate", () => {
    expect(isOverdue({ dueDate: "2000-01-01", status: "DONE" })).toBe(false);
    expect(isOverdue({ dueDate: "2000-01-01", status: "OPEN" })).toBe(true);
    expect(isOverdue({ dueDate: null, status: "OPEN" })).toBe(false);
  });

  it("getNextStatuses excludes current", () => {
    expect(getNextStatuses("OPEN")).toEqual(["IN_PROGRESS", "DONE", "CANCELLED"]);
  });
});

describe("TaskCard", () => {
  it("renders title and category badge", () => {
    renderWith(<TaskCard task={baseTask} canEdit={false} canDelete={false} {...handlers} />);
    expect(screen.getByText("Сдать отчёт по НДС")).toBeInTheDocument();
    expect(screen.getAllByText("Отчётность").length).toBeGreaterThan(0);
  });

  it("calls onComment on title click", () => {
    const onComment = vi.fn();
    renderWith(
      <TaskCard
        task={baseTask}
        canEdit={false}
        canDelete={false}
        {...handlers}
        onComment={onComment}
      />,
    );
    fireEvent.click(screen.getByText("Сдать отчёт по НДС"));
    expect(onComment).toHaveBeenCalledWith(baseTask);
  });
});

describe("KanbanCard", () => {
  it("renders title and priority", () => {
    renderWith(
      <KanbanCard
        task={baseTask}
        canEdit={false}
        canDelete={false}
        {...handlers}
        onDragStart={noop}
        onDragEnd={noop}
        isDragging={false}
      />,
    );
    expect(screen.getByText("Сдать отчёт по НДС")).toBeInTheDocument();
    expect(screen.getByText("Средний")).toBeInTheDocument();
  });
});

describe("GroupedTaskRow", () => {
  it("renders group header and expands sub-rows on click", () => {
    const tasks = [
      { ...baseTask, id: "t1", groupId: "g1", organization: { id: "o1", name: "ООО Ромашка" } },
      {
        ...baseTask,
        id: "t2",
        groupId: "g1",
        status: "DONE",
        organization: { id: "o2", name: "ООО Лютик" },
      },
    ];
    renderWith(
      <GroupedTaskRow tasks={tasks} canEdit={() => false} canDelete={() => false} {...handlers} />,
    );
    expect(screen.getByText(/2 орг\. · 1\/2 выполнено/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Сдать отчёт по НДС"));
    expect(screen.getByText("ООО Ромашка")).toBeInTheDocument();
    expect(screen.getByText("ООО Лютик")).toBeInTheDocument();
  });
});
